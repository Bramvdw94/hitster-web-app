-- get_my_stats() (#30): the streak across midnight Amsterdam time, the per-decade window of the
-- last 50 answers, solo records, and that another player's rows never show up.
begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b');

insert into public.editions (id, sku, name, card_count) values
  ('10000000-0000-0000-0000-000000000001', 'orig', 'Original', 3);
insert into public.songs (id, spotify_track_id, title, card_year, year_source, year_status, playable_nl) values
  ('20000000-0000-0000-0000-000000000001', 't1', 'Eighties', 1984, 'hitify', 'certain', true),
  ('20000000-0000-0000-0000-000000000002', 't2', 'Nineties', 1993, 'hitify', 'uncertain', true),
  ('20000000-0000-0000-0000-000000000003', 't3', 'Seventies', 1975, 'hitify', 'certain', true);
insert into public.cards (edition_id, card_number, song_id) values
  ('10000000-0000-0000-0000-000000000001', 1, '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000001', 2, '20000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000001', 3, '20000000-0000-0000-0000-000000000003');

-- Player A finishes sessions at 23:30 and 00:30 Amsterdam time (CET, UTC+1): two days in
-- Amsterdam, one day in UTC.
insert into public.practice_sessions (id, player_id, session_number, song_ids, status, started_at, finished_at) values
  ('30000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 1,
   '{20000000-0000-0000-0000-000000000001}', 'finished', '2026-11-02 22:00Z', '2026-11-02 22:30Z'),
  ('30000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 2,
   '{20000000-0000-0000-0000-000000000001}', 'finished', '2026-11-02 23:00Z', '2026-11-02 23:30Z'),
  -- An older day that a gap separates from the streak.
  ('30000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-00000000000a', 3,
   '{20000000-0000-0000-0000-000000000001}', 'finished', '2026-10-30 10:00Z', '2026-10-30 10:30Z'),
  -- Player B played every day; none of it is A's.
  ('30000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-00000000000b', 1,
   '{20000000-0000-0000-0000-000000000001}', 'finished', '2026-11-01 10:00Z', '2026-11-01 10:30Z');

insert into public.attempts (player_id, song_id, practice_session_id, guessed_year, year_diff, points) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000001', 1984, 0, 5),
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
   '30000000-0000-0000-0000-000000000002', 1985, 1, 3);

-- 55 solo game placements in the 80s for A, one per game: the 5 oldest right, of the newest 50
-- only 20 right.
insert into public.games (id, owner_id, mode, variant, status, state, finished_at)
select ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, '00000000-0000-0000-0000-00000000000a',
  'solo', 'original', 'abandoned', '{}', '2026-10-01 00:00Z'::timestamptz + i * interval '1 minute'
from generate_series(1, 55) i;
insert into public.attempts (player_id, song_id, game_id, placed_correctly, points, answered_at)
select '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
  ('40000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  i <= 5 or i > 35,
  0, '2026-10-01 00:00Z'::timestamptz + i * interval '1 minute'
from generate_series(1, 55) i;

-- A "Ken ik niet" in the 70s.
insert into public.attempts (player_id, song_id, practice_session_id, dont_know, points) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000003',
   '30000000-0000-0000-0000-000000000003', true, 0);

-- B's answers: all close, in every decade.
insert into public.attempts (player_id, song_id, practice_session_id, guessed_year, year_diff, points, artist_correct)
select '00000000-0000-0000-0000-00000000000b', s, '30000000-0000-0000-0000-000000000004', 2000, 0, 7, true
from unnest('{20000000-0000-0000-0000-000000000001,20000000-0000-0000-0000-000000000002,20000000-0000-0000-0000-000000000003}'::uuid[]) s;

-- Solo records: A won Original in 17 and 23 songs and once ran out of deck; a pass-and-play game
-- and B's Pro record don't count.
insert into public.games (owner_id, mode, variant, status, state, songs_needed, finished_at) values
  ('00000000-0000-0000-0000-00000000000a', 'solo', 'original', 'finished', '{}', 23, '2026-11-01 10:00Z'),
  ('00000000-0000-0000-0000-00000000000a', 'solo', 'original', 'finished', '{}', 17, '2026-11-01 11:00Z'),
  ('00000000-0000-0000-0000-00000000000a', 'solo', 'original', 'finished', '{}', null, '2026-11-01 12:00Z'),
  ('00000000-0000-0000-0000-00000000000a', 'pass_and_play', 'pro', 'finished', '{}', null, '2026-11-01 13:00Z'),
  ('00000000-0000-0000-0000-00000000000b', 'solo', 'pro', 'finished', '{}', 12, '2026-11-01 14:00Z');

insert into public.song_progress (player_id, song_id, box, last_seen_session, due_at_session) values
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', 5, 2, 18),
  ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000003', 1, 2, 3),
  ('00000000-0000-0000-0000-00000000000b', '20000000-0000-0000-0000-000000000002', 5, 1, 17);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
declare
  s jsonb;
  d jsonb;
begin
  s := public.get_my_stats('2026-11-03 12:00Z');
  if (s->>'streakDays')::int <> 2 then
    raise exception 'streak across midnight Amsterdam: expected 2, got %', s->>'streakDays';
  end if;
  if (s->>'sessionsPlayed')::int <> 3 then
    raise exception 'sessions: expected 3, got %', s->>'sessionsPlayed';
  end if;
  if s->'sessions' <> '[{"number": 3, "points": 0}, {"number": 1, "points": 5}, {"number": 2, "points": 3}]'::jsonb then
    raise exception 'sessions in order: got %', s->'sessions';
  end if;

  -- Tomorrow without a session yet the streak holds; the day after, it is gone.
  s := public.get_my_stats('2026-11-04 22:59Z');
  if (s->>'streakDays')::int <> 2 then
    raise exception 'streak on the next day: expected 2, got %', s->>'streakDays';
  end if;
  s := public.get_my_stats('2026-11-04 23:00Z');
  if (s->>'streakDays')::int <> 0 then
    raise exception 'streak after a missed day: expected 0, got %', s->>'streakDays';
  end if;

  s := public.get_my_stats('2026-11-03 12:00Z');
  select x into d from jsonb_array_elements(s->'decades') x where (x->>'decade')::int = 1980;
  -- The newest 50 of 57: the 2 practice answers, 28 wrong placements and 20 right ones.
  if (d->>'answered')::int <> 50 then
    raise exception 'decade window: expected 50 answers, got %', d;
  end if;
  if (d->>'close')::int <> 22 then
    raise exception 'decade window: expected 22 close, got %', d;
  end if;
  select x into d from jsonb_array_elements(s->'decades') x where (x->>'decade')::int = 1970;
  if d <> '{"decade": 1970, "answered": 1, "close": 0}'::jsonb then
    raise exception '"Ken ik niet" counts as wrong: got %', d;
  end if;
  if exists (select 1 from jsonb_array_elements(s->'decades') x where (x->>'decade')::int = 1990) then
    raise exception 'another player''s answers in the decades: %', s->'decades';
  end if;

  if s->'boxes' <> '[1, 0, 0, 0, 1]'::jsonb or (s->>'totalSongs')::int <> 3 then
    raise exception 'boxes: got % of %', s->'boxes', s->>'totalSongs';
  end if;
  if s->'editions' <> '[{"name": "Original", "known": 1, "total": 3}]'::jsonb then
    raise exception 'editions: got %', s->'editions';
  end if;
  if (s->>'artistCorrect')::int <> 0 or (s->>'answers')::int <> 58 then
    raise exception 'artist: got % of %', s->>'artistCorrect', s->>'answers';
  end if;
  if jsonb_array_length(s->'hardest') <> 1
     or s->'hardest'->0->>'title' <> 'Seventies' or (s->'hardest'->0->>'wrong')::int <> 1 then
    raise exception 'hardest: got %', s->'hardest';
  end if;
  if s->'solo' <> '[{"variant": "original", "best": 17, "games": 3}]'::jsonb then
    raise exception 'solo records: got %', s->'solo';
  end if;
end $$;

rollback;
