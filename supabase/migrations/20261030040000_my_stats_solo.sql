-- Solo records on "Mijn voortgang" (#30): get_my_stats() also returns the personal best and the
-- number of finished games per solo variant, now that games exist (#27).
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
  -- Solo only: pass-and-play doesn't count. A deck that ran out finishes without a score.
  solo as (
    select g.variant, min(g.songs_needed)::integer as best, count(*)::integer as games
    from public.games g
    where g.owner_id = (select id from me) and g.mode = 'solo' and g.status = 'finished'
    group by g.variant
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
    'solo', coalesce((
      select jsonb_agg(jsonb_build_object('variant', variant, 'best', best, 'games', games) order by variant)
      from solo
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

revoke execute on function public.get_my_stats(timestamptz) from public, anon;
grant execute on function public.get_my_stats(timestamptz) to authenticated;
