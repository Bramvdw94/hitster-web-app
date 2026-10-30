-- "Oefen deze nummers" on Ontdek starts a session with that filter even while another session
-- is running: the running one becomes `abandoned`. Its answers stay (they count for the boxes and
-- years off), but it never counts as a played session on Mijn voortgang.

alter type public.practice_session_status add value if not exists 'abandoned';

-- The same as before, plus p_replace (last, with a default, so deployed code keeps working).
drop function public.start_practice_session(uuid[], boolean, uuid[], uuid, integer, integer);

create function public.start_practice_session(
  p_edition_ids uuid[],
  p_weak_only boolean,
  p_song_ids uuid[],
  p_artist_id uuid default null,
  p_year_from integer default null,
  p_year_to integer default null,
  p_replace boolean default false
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
  if v_session is not null and not coalesce(p_replace, false) then
    return v_session;
  end if;
  -- Replacing: the answers given so far stay, the rest of the running session is dropped.
  if v_session is not null then
    update public.practice_sessions set status = 'abandoned' where id = v_session;
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

  insert into public.practice_sessions (
    player_id, session_number, edition_ids, weak_only, song_ids, artist_id, year_from, year_to
  ) values (
    v_player, v_number, coalesce(p_edition_ids, '{}'), coalesce(p_weak_only, false), p_song_ids,
    p_artist_id, p_year_from, p_year_to
  )
  returning id into v_session;
  return v_session;
end;
$$;

revoke execute on function public.start_practice_session(uuid[], boolean, uuid[], uuid, integer, integer, boolean) from public, anon;
grant execute on function public.start_practice_session(uuid[], boolean, uuid[], uuid, integer, integer, boolean) to authenticated;
