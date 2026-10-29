-- Leitner boxes per player per song, and the session mix that brings weak songs back (#24).
-- The rules (box transitions, due intervals, the mix) live in src/lib/practice/leitner.ts and
-- src/lib/practice/mix.ts; these functions only read candidates and write atomically.

create table public.song_progress (
  player_id uuid not null references public.profiles (id) on delete cascade,
  song_id uuid not null references public.songs (id) on delete cascade,
  box integer not null check (box between 1 and 5),
  -- Counted in the player's own practice sessions (profiles.practice_session_count).
  last_seen_session integer not null check (last_seen_session >= 0),
  due_at_session integer not null check (due_at_session > last_seen_session),
  updated_at timestamptz not null default now(),
  primary key (player_id, song_id)
);

create index song_progress_player_box_idx on public.song_progress (player_id, box, due_at_session);

alter table public.song_progress enable row level security;

create policy "Players read their own song progress" on public.song_progress
  for select to authenticated using ((select auth.uid()) = player_id);

revoke all on public.song_progress from anon;
revoke insert, update, delete, truncate on public.song_progress from authenticated;

-- Share of answers at most 1 year off per decade of the card year, for the new-song weighting.
-- RLS on attempts keeps it to the player's own answers.
create view public.practice_decade_stats
with (security_invoker = true)
as
select
  (floor(y.card_year / 10.0) * 10)::integer as decade,
  count(*)::integer as answered,
  count(*) filter (where abs(a.year_diff) <= 1)::integer as close
from public.attempts a
join public.song_card_years y on y.song_id = a.song_id
where y.card_year is not null
group by 1;

revoke all on public.practice_decade_stats from anon;
grant select on public.practice_decade_stats to authenticated;

-- The songs a session can be dealt from, with the player's box for each, as one JSON array
-- (one value, so PostgREST's row limit doesn't cut "Alles" short). Empty editions = Alles.
-- Weak only: songs in box 1-2 across every edition.
create function public.practice_candidates(p_edition_ids uuid[], p_weak_only boolean default false)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'cardYear', p.card_year,
    'box', sp.box,
    'lastSeen', sp.last_seen_session,
    'dueAt', sp.due_at_session
  )), '[]'::jsonb)
  from public.playable_songs p
  left join public.song_progress sp
    on sp.song_id = p.id and sp.player_id = (select auth.uid())
  where case
    when p_weak_only then sp.box <= 2
    else cardinality(coalesce(p_edition_ids, '{}')) = 0
      or exists (
        select 1 from public.cards c
        where c.song_id = p.id and c.edition_id = any (p_edition_ids)
      )
  end;
$$;

revoke execute on function public.practice_candidates(uuid[], boolean) from public, anon;
grant execute on function public.practice_candidates(uuid[], boolean) to authenticated;

-- The session is now dealt by the server action (the mix), so this takes the songs.
drop function public.start_practice_session(uuid[]);

-- Stores a dealt practice session and counts it as the player's next session. Returns the
-- running session instead when there is one. Every song must be playable; the mix picks them,
-- so a player calling this directly can only choose which songs to practise.
create function public.start_practice_session(
  p_edition_ids uuid[],
  p_weak_only boolean,
  p_song_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player uuid := (select auth.uid());
  v_session uuid;
  v_number integer;
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

  if coalesce(cardinality(p_song_ids), 0) = 0 then
    raise exception 'no playable songs' using errcode = 'P0002';
  end if;
  if cardinality(p_song_ids) > 15
     or (select count(distinct x) from unnest(p_song_ids) x) <> cardinality(p_song_ids)
     or (select count(*) from public.playable_songs p where p.id = any (p_song_ids)) <> cardinality(p_song_ids) then
    raise exception 'invalid songs' using errcode = '22023';
  end if;

  update public.profiles
    set practice_session_count = practice_session_count + 1
    where id = v_player
    returning practice_session_count into v_number;

  insert into public.practice_sessions (player_id, session_number, edition_ids, weak_only, song_ids)
    values (v_player, v_number, coalesce(p_edition_ids, '{}'), coalesce(p_weak_only, false), p_song_ids)
    returning id into v_session;
  return v_session;
end;
$$;

revoke execute on function public.start_practice_session(uuid[], boolean, uuid[]) from public, anon;
grant execute on function public.start_practice_session(uuid[], boolean, uuid[]) to authenticated;

-- Stores one scored answer and moves the song's box, in one transaction. Server only (secret
-- key): recordAttempt() in src/lib/practice/progress.ts computes the boxes and the interval.
-- Raises 40001 when the box changed since it was read, so a race can't skip a box.
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
  p_due_interval integer
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
    player_id, song_id, practice_session_id, guessed_year, year_diff, artist_input,
    artist_correct, dont_know, points, box_before, box_after
  ) values (
    p_player_id, p_song_id, p_practice_session_id, p_guessed_year, p_year_diff, p_artist_input,
    p_artist_correct, p_dont_know, p_points, p_box_before, p_box_after
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

revoke execute on function public.record_attempt(uuid, uuid, uuid, integer, integer, text, boolean, boolean, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_attempt(uuid, uuid, uuid, integer, integer, text, boolean, boolean, integer, integer, integer, integer)
  to service_role;
