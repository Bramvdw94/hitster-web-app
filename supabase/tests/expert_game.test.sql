-- Expert placements (#28): an attempt in a game can carry the typed year and the artist result,
-- and still needs whether the card was placed right.
begin;

insert into auth.users (id) values ('00000000-0000-0000-0000-00000000000b');
insert into public.songs (id, spotify_track_id, title, card_year, year_source, year_status, playable_nl) values
  ('20000000-0000-0000-0000-000000000011', 't11', 'Eighties', 1984, 'hitify', 'certain', true);
insert into public.games (id, owner_id, mode, variant, state) values
  ('40000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-00000000000b', 'solo', 'expert', '{}');

select public.record_attempt(
  p_player_id => '00000000-0000-0000-0000-00000000000b', p_song_id => '20000000-0000-0000-0000-000000000011',
  p_practice_session_id => null, p_guessed_year => 1985, p_year_diff => 1, p_artist_input => 'madona',
  p_artist_correct => true, p_dont_know => false, p_points => 0, p_box_before => 1, p_box_after => 2,
  p_due_interval => 2, p_game_id => '40000000-0000-0000-0000-000000000011', p_placed_correctly => false);

do $$
begin
  if (select guessed_year from public.attempts where game_id = '40000000-0000-0000-0000-000000000011') <> 1985 then
    raise exception 'the typed year should be stored';
  end if;
  if not (select artist_correct from public.attempts where game_id = '40000000-0000-0000-0000-000000000011') then
    raise exception 'the artist result should be stored';
  end if;
  if (select box from public.song_progress where player_id = '00000000-0000-0000-0000-00000000000b') <> 2 then
    raise exception 'the year should move the box up';
  end if;
end;
$$;

rollback;
