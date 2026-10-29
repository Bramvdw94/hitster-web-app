-- Practice mode: sessions of 15 songs and the answers to them. See docs/spec/data-model.md.
-- Players read only their own rows and never write them directly: start_practice_session()
-- deals a session, and the answer server action scores and stores attempts with the
-- secret key, so a player can't fake points.

create type public.practice_session_status as enum ('active', 'finished');

create table public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  session_number integer not null check (session_number > 0),
  -- Empty means "Alles".
  edition_ids uuid[] not null default '{}',
  weak_only boolean not null default false,
  -- The songs, in the order they are played.
  song_ids uuid[] not null check (cardinality(song_ids) between 1 and 15),
  status public.practice_session_status not null default 'active',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status = 'finished') = (finished_at is not null))
);

-- At most one running session per player, so reopening the app always finds the same one.
create unique index practice_sessions_one_active_idx
  on public.practice_sessions (player_id) where status = 'active';
create index practice_sessions_player_id_idx on public.practice_sessions (player_id, started_at desc);

-- One answer to one song. Solo game mode (#27) adds game_id next to practice_session_id.
create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles (id) on delete cascade,
  song_id uuid not null references public.songs (id),
  practice_session_id uuid references public.practice_sessions (id) on delete cascade,
  -- Null for "Ken ik niet".
  guessed_year integer check (guessed_year between 1800 and 2100),
  -- Guessed year minus card year, so negative is too early. Null for "Ken ik niet".
  year_diff integer,
  artist_input text,
  artist_correct boolean not null default false,
  dont_know boolean not null default false,
  points integer not null check (points between 0 and 7),
  -- Leitner boxes, filled in from #24.
  box_before integer check (box_before between 1 and 5),
  box_after integer check (box_after between 1 and 5),
  answered_at timestamptz not null default now(),
  check (dont_know = (guessed_year is null)),
  check ((guessed_year is null) = (year_diff is null)),
  unique (practice_session_id, song_id)
);

create index attempts_player_id_idx on public.attempts (player_id, answered_at desc);
create index attempts_song_id_idx on public.attempts (song_id);

alter table public.practice_sessions enable row level security;
alter table public.attempts enable row level security;

create policy "Players read their own practice sessions" on public.practice_sessions
  for select to authenticated using ((select auth.uid()) = player_id);
create policy "Players read their own attempts" on public.attempts
  for select to authenticated using ((select auth.uid()) = player_id);

revoke all on public.practice_sessions, public.attempts from anon;
revoke insert, update, delete, truncate on public.practice_sessions, public.attempts from authenticated;

-- Playable songs per edition, for the edition list on the Oefenen screen.
create view public.edition_song_counts
with (security_invoker = true)
as
select e.id, e.sku, e.name, e.is_expansion, count(distinct p.id)::integer as song_count
from public.editions e
join public.cards c on c.edition_id = e.id
join public.playable_songs p on p.id = c.song_id
group by e.id;

revoke all on public.edition_song_counts from anon;
grant select on public.edition_song_counts to authenticated;

-- Deals a practice session of up to 15 random playable songs from the editions (empty = Alles)
-- and counts it as the player's next session. Returns the running session instead when there
-- is one. Weak-song repetition (#24) replaces the random pick.
create function public.start_practice_session(p_edition_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := (select auth.uid());
  v_session uuid;
  v_number integer;
  v_songs uuid[];
begin
  if v_player is null then
    raise exception 'not logged in' using errcode = '28000';
  end if;

  -- Locks the player's profile, so a double tap can't deal two sessions.
  perform 1 from public.profiles where id = v_player for update;
  if not found then
    raise exception 'no profile' using errcode = 'P0002';
  end if;

  select s.id into v_session
    from public.practice_sessions s
    where s.player_id = v_player and s.status = 'active';
  if v_session is not null then
    return v_session;
  end if;

  select array_agg(id) into v_songs
  from (
    select p.id
    from public.playable_songs p
    where cardinality(coalesce(p_edition_ids, '{}')) = 0
       or exists (
         select 1 from public.cards c
         where c.song_id = p.id and c.edition_id = any (p_edition_ids)
       )
    order by random()
    limit 15
  ) picked;

  if v_songs is null then
    raise exception 'no playable songs' using errcode = 'P0002';
  end if;

  update public.profiles
    set practice_session_count = practice_session_count + 1
    where id = v_player
    returning practice_session_count into v_number;

  insert into public.practice_sessions (player_id, session_number, edition_ids, song_ids)
    values (v_player, v_number, coalesce(p_edition_ids, '{}'), v_songs)
    returning id into v_session;
  return v_session;
end;
$$;

revoke execute on function public.start_practice_session(uuid[]) from public, anon;
grant execute on function public.start_practice_session(uuid[]) to authenticated;
