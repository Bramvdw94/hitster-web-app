-- Game mode: one row per game, with everything needed to resume it in `state` (#27). Players
-- read only their own games and never write them: the server actions in src/app/spel/actions.ts
-- deal, place and score with the secret key, so a player can't fake a placement or a score.

create type public.game_mode as enum ('solo', 'pass_and_play');
create type public.game_variant as enum ('original', 'pro', 'expert');
-- `abandoned`: replaced by a new game before it ended.
create type public.game_status as enum ('active', 'finished', 'abandoned');

create table public.games (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  mode public.game_mode not null,
  variant public.game_variant not null,
  -- Empty means all editions.
  edition_ids uuid[] not null default '{}',
  status public.game_status not null default 'active',
  -- The deck, the timeline and the turn; shape in src/lib/game/state.ts.
  state jsonb not null,
  -- Solo score: songs placed to reach 10 cards. Null while running, or when the deck ran out.
  songs_needed integer check (songs_needed > 0),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'active') = (finished_at is null)),
  check (songs_needed is null or status = 'finished')
);

-- Only one game runs at a time; starting a new one abandons it first.
create unique index games_one_active_idx on public.games (owner_id) where status = 'active';
create index games_best_idx on public.games (owner_id, mode, variant, songs_needed) where status = 'finished';

alter table public.games enable row level security;

create policy "Players read their own games" on public.games
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.games from anon;
revoke insert, update, delete, truncate on public.games from authenticated;

-- A solo placement is an attempt too, so it feeds weak songs. It has no guessed year and no
-- "Ken ik niet", so the year checks only hold for practice answers.
alter table public.attempts
  add column game_id uuid references public.games (id) on delete cascade,
  -- Whether the card fitted where it was put. Only for placements, which have no year to judge.
  add column placed_correctly boolean,
  add constraint attempts_one_parent_check check (num_nonnulls(practice_session_id, game_id) = 1),
  add constraint attempts_placed_correctly_check check ((game_id is null) = (placed_correctly is null)),
  add constraint attempts_game_song_key unique (game_id, song_id),
  drop constraint attempts_check,
  add constraint attempts_dont_know_check check (game_id is not null or dont_know = (guessed_year is null));

create index attempts_game_id_idx on public.attempts (game_id) where game_id is not null;

-- Placements have no year to weigh, so the new-song decade weighting stays on practice answers.
create or replace view public.practice_decade_stats
with (security_invoker = true)
as
select
  (floor(y.card_year / 10.0) * 10)::integer as decade,
  count(*)::integer as answered,
  count(*) filter (where abs(a.year_diff) <= 1)::integer as close
from public.attempts a
join public.song_card_years y on y.song_id = a.song_id
where y.card_year is not null and a.practice_session_id is not null
group by 1;

-- record_attempt now takes the game too. Same rules as before: server only, and it raises
-- 40001 when the box changed since it was read.
drop function public.record_attempt(uuid, uuid, uuid, integer, integer, text, boolean, boolean, integer, integer, integer, integer);

create function public.record_attempt(
  p_player_id uuid,
  p_song_id uuid,
  p_practice_session_id uuid,
  p_guessed_year integer,
  p_year_diff integer,
  p_artist_input text,
  p_artist_correct boolean,
  p_dont_know boolean,
  p_points integer,
  p_box_before integer,
  p_box_after integer,
  p_due_interval integer,
  -- Last and optional, so the practice code deployed before this migration keeps working.
  p_game_id uuid default null,
  p_placed_correctly boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current integer;
  v_session_count integer;
begin
  select practice_session_count into v_session_count
    from public.profiles where id = p_player_id;
  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;

  select box into v_current
    from public.song_progress
    where player_id = p_player_id and song_id = p_song_id
    for update;
  if coalesce(v_current, 1) <> p_box_before then
    raise exception 'box changed' using errcode = '40001';
  end if;

  insert into public.attempts (
    player_id, song_id, practice_session_id, game_id, guessed_year, year_diff, artist_input,
    artist_correct, dont_know, points, box_before, box_after, placed_correctly
  ) values (
    p_player_id, p_song_id, p_practice_session_id, p_game_id, p_guessed_year, p_year_diff, p_artist_input,
    p_artist_correct, p_dont_know, p_points, p_box_before, p_box_after, p_placed_correctly
  );

  insert into public.song_progress (player_id, song_id, box, last_seen_session, due_at_session)
    values (p_player_id, p_song_id, p_box_after, v_session_count, v_session_count + p_due_interval)
  on conflict (player_id, song_id) do update
    set box = excluded.box,
        last_seen_session = excluded.last_seen_session,
        due_at_session = excluded.due_at_session,
        updated_at = now();
end;
$$;

revoke execute on function public.record_attempt(uuid, uuid, uuid, integer, integer, text, boolean, boolean, integer, integer, integer, integer, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_attempt(uuid, uuid, uuid, integer, integer, text, boolean, boolean, integer, integer, integer, integer, uuid, boolean)
  to service_role;

-- "Mijn voortgang" (#30) judged every answer by its year. A placement has no year, so it counts
-- as close when it was placed right. Otherwise the same as 20261030020000_my_stats.sql.
create or replace function public.get_my_stats(p_now timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select (select auth.uid()) as id
  ),
  progress as (
    select sp.song_id, sp.box
    from public.song_progress sp
    join public.playable_songs p on p.id = sp.song_id
    where sp.player_id = (select id from me)
  ),
  my_attempts as (
    select a.*, y.card_year
    from public.attempts a
    join public.song_card_years y on y.song_id = a.song_id
    where a.player_id = (select id from me)
  ),
  finished as (
    select s.id, s.session_number, s.finished_at
    from public.practice_sessions s
    where s.player_id = (select id from me) and s.status = 'finished'
  ),
  -- Days with at least one finished session, on the Amsterdam calendar.
  practice_days as (
    select distinct (f.finished_at at time zone 'Europe/Amsterdam')::date as day
    from finished f
  ),
  today as (
    select (p_now at time zone 'Europe/Amsterdam')::date as day
  ),
  -- The streak runs up to today, or up to yesterday while today has no session yet.
  -- Consecutive days share day - row_number(), so the run holding the latest day is the streak.
  runs as (
    select day, day - (row_number() over (order by day))::integer as run
    from practice_days
    where day <= (select day from today)
  ),
  streak as (
    select case
      when max(day) >= (select day from today) - 1
        then count(*) filter (where run = (select run from runs order by day desc limit 1))
      else 0
    end::integer as days
    from runs
  ),
  last_sessions as (
    select f.session_number, f.finished_at,
      coalesce((select sum(a.points) from public.attempts a where a.practice_session_id = f.id), 0)::integer as points
    from finished f
    order by f.finished_at desc
    limit 20
  ),
  -- The last 50 answers per decade of the card year, practice and solo game alike.
  decade_window as (
    select (floor(a.card_year / 10.0) * 10)::integer as decade,
      coalesce(a.placed_correctly, abs(a.year_diff) <= 1, false) as close,
      row_number() over (partition by floor(a.card_year / 10.0) order by a.answered_at desc, a.id) as n
    from my_attempts a
    where a.card_year is not null
  ),
  decades as (
    select decade, count(*)::integer as answered,
      count(*) filter (where close)::integer as close
    from decade_window
    where n <= 50
    group by decade
  ),
  editions as (
    select e.name, e.is_expansion, e.song_count as total,
      (select count(*) from progress pr
        where pr.box = 5
          and exists (select 1 from public.cards c where c.edition_id = e.id and c.song_id = pr.song_id)
      )::integer as known
    from public.edition_song_counts e
  ),
  hardest as (
    select pr.song_id,
      (select count(*) from my_attempts a
        where a.song_id = pr.song_id and not coalesce(a.placed_correctly, abs(a.year_diff) <= 1, false))::integer as wrong
    from progress pr
    where pr.box = 1
  )
  select jsonb_build_object(
    'totalSongs', (select count(*)::integer from public.playable_songs),
    'boxes', jsonb_build_array(
      (select count(*)::integer from progress where box = 1),
      (select count(*)::integer from progress where box = 2),
      (select count(*)::integer from progress where box = 3),
      (select count(*)::integer from progress where box = 4),
      (select count(*)::integer from progress where box = 5)
    ),
    'streakDays', coalesce((select days from streak), 0),
    'sessionsPlayed', (select count(*)::integer from finished),
    'answers', (select count(*)::integer from my_attempts),
    'artistCorrect', (select count(*)::integer from my_attempts where artist_correct),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object('number', session_number, 'points', points) order by finished_at)
      from last_sessions
    ), '[]'::jsonb),
    'decades', coalesce((
      select jsonb_agg(jsonb_build_object('decade', decade, 'answered', answered, 'close', close) order by decade)
      from decades
    ), '[]'::jsonb),
    'editions', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'known', known, 'total', total) order by is_expansion, name)
      from editions
    ), '[]'::jsonb),
    'hardest', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.song_id,
        'title', p.title,
        'artists', (
          select string_agg(ar.name, ', ' order by sa.position)
          from public.song_artists sa join public.artists ar on ar.id = sa.artist_id
          where sa.song_id = h.song_id
        ),
        'cardYear', p.card_year,
        'coverUrl', p.cover_url,
        'wrong', h.wrong
      ) order by h.wrong desc, p.title)
      from (select * from hardest order by wrong desc limit 10) h
      join public.playable_songs p on p.id = h.song_id
    ), '[]'::jsonb)
  );
$$;
