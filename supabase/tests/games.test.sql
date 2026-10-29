-- Solo game placements (#27): record_attempt with a game, the attempt checks, one running game
-- per player, and that placements stay out of the practice decade weighting.
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000a');
insert into public.songs (id, spotify_track_id, title, card_year, year_source, year_status, playable_nl) values
  ('20000000-0000-0000-0000-000000000001', 't1', 'Eighties', 1984, 'hitify', 'certain', true),
  ('20000000-0000-0000-0000-000000000002', 't2', 'Nineties', 1993, 'hitify', 'certain', true);
insert into public.games (id, owner_id, mode, variant, state) values
  ('40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'solo', 'original', '{}');

-- A right placement, then a wrong one of another song.
select public.record_attempt(
  p_player_id => '00000000-0000-0000-0000-00000000000a', p_song_id => '20000000-0000-0000-0000-000000000001',
  p_practice_session_id => null, p_guessed_year => null, p_year_diff => null, p_artist_input => null,
  p_artist_correct => false, p_dont_know => false, p_points => 0, p_box_before => 1, p_box_after => 2,
  p_due_interval => 2, p_game_id => '40000000-0000-0000-0000-000000000001', p_placed_correctly => true);
select public.record_attempt(
  p_player_id => '00000000-0000-0000-0000-00000000000a', p_song_id => '20000000-0000-0000-0000-000000000002',
  p_practice_session_id => null, p_guessed_year => null, p_year_diff => null, p_artist_input => null,
  p_artist_correct => false, p_dont_know => false, p_points => 0, p_box_before => 1, p_box_after => 1,
  p_due_interval => 1, p_game_id => '40000000-0000-0000-0000-000000000001', p_placed_correctly => false);

do $$
begin
  if (select box from public.song_progress where song_id = '20000000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'a right placement should move the box up';
  end if;
  if (select count(*) from public.attempts where game_id is not null) <> 2 then
    raise exception 'expected 2 placements';
  end if;

  -- The same song twice in one game.
  begin
    insert into public.attempts (player_id, song_id, game_id, placed_correctly, points)
      values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001',
              '40000000-0000-0000-0000-000000000001', true, 0);
    raise exception 'a song twice in one game was allowed';
  exception when unique_violation then null;
  end;

  -- An attempt needs exactly one of a practice session and a game.
  begin
    insert into public.attempts (player_id, song_id, dont_know, points)
      values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000001', true, 0);
    raise exception 'an attempt without a session or game was allowed';
  exception when check_violation then null;
  end;

  -- A placement must say whether it was right.
  begin
    insert into public.attempts (player_id, song_id, game_id, points)
      values ('00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000002',
              '40000000-0000-0000-0000-000000000001', 0);
    raise exception 'a placement without placed_correctly was allowed';
  exception when check_violation then null;
  end;

  -- Only one running game per player.
  begin
    insert into public.games (owner_id, mode, variant, state)
      values ('00000000-0000-0000-0000-00000000000a', 'solo', 'original', '{}');
    raise exception 'a second running game was allowed';
  exception when unique_violation then null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
declare
  d jsonb;
begin
  if exists (select 1 from public.practice_decade_stats) then
    raise exception 'placements in the practice decade weighting';
  end if;
  if (select count(*) from public.games) <> 1 then
    raise exception 'the player should read their own game';
  end if;

  select x into d from jsonb_array_elements(public.get_my_stats()->'decades') x where (x->>'decade')::int = 1980;
  if d <> '{"decade": 1980, "answered": 1, "close": 1}'::jsonb then
    raise exception 'a right placement counts as close: got %', d;
  end if;
  select x into d from jsonb_array_elements(public.get_my_stats()->'decades') x where (x->>'decade')::int = 1990;
  if d <> '{"decade": 1990, "answered": 1, "close": 0}'::jsonb then
    raise exception 'a wrong placement counts as wrong: got %', d;
  end if;
end $$;

rollback;
