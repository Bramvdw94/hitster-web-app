-- Practice filters (artist, decade, own year range), "jaren ernaast" per song, decade and artist,
-- and the Ontdek page. Everything reads the catalogue live, so newly imported songs and artists
-- show up without further changes.

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Lower case without accents, for artist search ("Beyonce" finds "Beyoncé").
create function public.search_text(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_text, '')));
$$;

-- The filter a session was dealt with, so "Nog een ronde" deals the same kind of songs.
alter table public.practice_sessions
  add column artist_id uuid references public.artists (id) on delete set null,
  add column year_from integer check (year_from between 1800 and 2100),
  add column year_to integer check (year_to between 1800 and 2100),
  add constraint practice_sessions_year_range_check check (year_from is null or year_to is null or year_from <= year_to);

-- practice_candidates now also filters on artist and card year. Nulls mean no filter, and the
-- filters hold for weak only too ("zwakke nummers uit de 80s").
drop function public.practice_candidates(uuid[], boolean);

create function public.practice_candidates(
  p_edition_ids uuid[],
  p_weak_only boolean default false,
  p_artist_id uuid default null,
  p_year_from integer default null,
  p_year_to integer default null
)
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
  end
    and (p_artist_id is null
      or exists (select 1 from public.song_artists sa where sa.song_id = p.id and sa.artist_id = p_artist_id))
    and (p_year_from is null or p.card_year >= p_year_from)
    and (p_year_to is null or p.card_year <= p_year_to);
$$;

revoke execute on function public.practice_candidates(uuid[], boolean, uuid, integer, integer) from public, anon;
grant execute on function public.practice_candidates(uuid[], boolean, uuid, integer, integer) to authenticated;

-- start_practice_session also stores the filter. The new parameters come last with defaults, so
-- the code deployed before this migration keeps working.
drop function public.start_practice_session(uuid[], boolean, uuid[]);

create function public.start_practice_session(
  p_edition_ids uuid[],
  p_weak_only boolean,
  p_song_ids uuid[],
  p_artist_id uuid default null,
  p_year_from integer default null,
  p_year_to integer default null
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

revoke execute on function public.start_practice_session(uuid[], boolean, uuid[], uuid, integer, integer) from public, anon;
grant execute on function public.start_practice_session(uuid[], boolean, uuid[], uuid, integer, integer) to authenticated;

-- Artists with at least one playable song whose name or alias looks like the query: a plain
-- substring first, then typos by trigram word similarity. At most 8, best first.
create function public.find_artists(p_query text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select public.search_text(trim(p_query)) as text
  ),
  scored as (
    select a.id, a.name,
      greatest(
        extensions.word_similarity((select text from q), public.search_text(a.name)),
        coalesce((select max(extensions.word_similarity((select text from q), public.search_text(al)))
          from unnest(a.aliases) al), 0)
      ) as score,
      public.search_text(a.name) like '%' || (select text from q) || '%'
        or exists (select 1 from unnest(a.aliases) al
          where public.search_text(al) like '%' || (select text from q) || '%') as is_substring
    from public.artists a
    where length((select text from q)) >= 2
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'songCount', songs)
    order by is_substring desc, score desc, name), '[]'::jsonb)
  from (
    select * from (
      select s.id, s.name, s.is_substring, s.score,
        (select count(*)::integer from public.song_artists sa
          join public.playable_songs p on p.id = sa.song_id
          where sa.artist_id = s.id) as songs
      from scored s
      where s.is_substring or s.score >= 0.45
    ) counted
    where songs > 0
    order by is_substring desc, score desc, name
    limit 8
  ) found;
$$;

revoke execute on function public.find_artists(text) from public, anon;
grant execute on function public.find_artists(text) to authenticated;

-- The Ontdek page: playable songs of an artist and/or a card-year range, oldest first, with the
-- player's own box and years off per song. Returns { total, songs } with at most p_limit songs,
-- so a wide range can't send the whole catalogue to a phone.
create function public.explore_songs(
  p_artist_id uuid default null,
  p_year_from integer default null,
  p_year_to integer default null,
  p_limit integer default 400
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with found as (
    select p.id, p.title, p.card_year, p.year_status, p.cover_url
    from public.playable_songs p
    where (p_artist_id is null
        or exists (select 1 from public.song_artists sa where sa.song_id = p.id and sa.artist_id = p_artist_id))
      and (p_year_from is null or p.card_year >= p_year_from)
      and (p_year_to is null or p.card_year <= p_year_to)
  ),
  shown as (
    select * from found order by card_year, title limit greatest(coalesce(p_limit, 400), 1)
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from found),
    'songs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'artists', (
          select string_agg(ar.name, ', ' order by sa.position)
          from public.song_artists sa join public.artists ar on ar.id = sa.artist_id
          where sa.song_id = s.id
        ),
        'cardYear', s.card_year,
        'uncertainYear', s.year_status = 'uncertain',
        'coverUrl', s.cover_url,
        'box', (select sp.box from public.song_progress sp
          where sp.song_id = s.id and sp.player_id = (select auth.uid())),
        'guesses', (select count(*)::integer from public.attempts a
          where a.song_id = s.id and a.player_id = (select auth.uid()) and a.year_diff is not null),
        'avgOff', (select round(avg(abs(a.year_diff)), 1) from public.attempts a
          where a.song_id = s.id and a.player_id = (select auth.uid()) and a.year_diff is not null)
      ) order by s.card_year, s.title)
      from shown s
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.explore_songs(uuid, integer, integer, integer) from public, anon;
grant execute on function public.explore_songs(uuid, integer, integer, integer) to authenticated;

-- "Jaren ernaast" on Mijn voortgang: the average of |guessed year - card year| over the last 50
-- guessed years per decade and per artist. Only answers with a year count: "Ken ik niet" and
-- game placements without a typed year have nothing to measure. Artists need 3 guesses.
create function public.get_my_years_off()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with guesses as (
    select a.id, a.song_id, abs(a.year_diff) as off, a.answered_at, y.card_year
    from public.attempts a
    join public.song_card_years y on y.song_id = a.song_id
    where a.player_id = (select auth.uid()) and a.year_diff is not null and y.card_year is not null
  ),
  decade_window as (
    select (floor(card_year / 10.0) * 10)::integer as decade, off,
      row_number() over (partition by floor(card_year / 10.0) order by answered_at desc, id) as n
    from guesses
  ),
  artist_window as (
    select sa.artist_id, g.off,
      row_number() over (partition by sa.artist_id order by g.answered_at desc, g.id) as n
    from guesses g
    join public.song_artists sa on sa.song_id = g.song_id
  ),
  artists as (
    select w.artist_id, count(*)::integer as guesses, round(avg(w.off), 1) as avg_off
    from artist_window w
    where w.n <= 50
    group by w.artist_id
    having count(*) >= 3
  )
  select jsonb_build_object(
    'decades', coalesce((
      select jsonb_agg(jsonb_build_object('decade', decade, 'guesses', guesses, 'avgOff', avg_off) order by decade)
      from (
        select decade, count(*)::integer as guesses, round(avg(off), 1) as avg_off
        from decade_window where n <= 50 group by decade
      ) d
    ), '[]'::jsonb),
    'artists', coalesce((
      select jsonb_agg(jsonb_build_object('id', ar.id, 'name', ar.name, 'guesses', x.guesses, 'avgOff', x.avg_off)
        order by x.avg_off desc, x.guesses desc, ar.name)
      from (select * from artists order by avg_off desc, guesses desc limit 10) x
      join public.artists ar on ar.id = x.artist_id
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_my_years_off() from public, anon;
grant execute on function public.get_my_years_off() to authenticated;
