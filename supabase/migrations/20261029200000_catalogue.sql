-- The catalogue: editions, songs, cards and artists. See docs/spec/data-model.md.
-- Players only read it. The catalogue import writes it with the secret key (service role),
-- which bypasses RLS. Only year_overrides is written from the app, by Bram.

create type public.year_source as enum ('songseeker', 'hitify', 'musicbrainz', 'bram');
create type public.year_status as enum ('certain', 'uncertain', 'missing');
create type public.artist_kind as enum ('person', 'group');

-- One published Dutch Hitster box.
create table public.editions (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  card_count integer not null check (card_count > 0),
  is_expansion boolean not null default false
);

-- One recording, stored once even when several editions print it.
create table public.songs (
  id uuid primary key default gen_random_uuid(),
  spotify_track_id text not null unique,
  title text not null,
  card_year integer check (card_year between 1800 and 2100),
  year_source public.year_source,
  year_status public.year_status not null default 'missing',
  playable_nl boolean not null default false,
  cover_url text,
  checked_at timestamptz,
  check ((card_year is null) = (year_status = 'missing'))
);

-- A card in an edition, pointing at a song.
create table public.cards (
  edition_id uuid not null references public.editions (id) on delete cascade,
  card_number integer not null check (card_number > 0),
  song_id uuid not null references public.songs (id),
  primary key (edition_id, card_number)
);

create index cards_song_id_idx on public.cards (song_id);

-- An artist, with aliases for typo-tolerant matching (#20).
create table public.artists (
  id uuid primary key default gen_random_uuid(),
  spotify_artist_id text unique,
  name text not null,
  kind public.artist_kind,
  aliases text[] not null default '{}'
);

-- The credited artists of a song, in Spotify's order.
create table public.song_artists (
  song_id uuid not null references public.songs (id) on delete cascade,
  artist_id uuid not null references public.artists (id),
  position integer not null check (position >= 0),
  primary key (song_id, position),
  unique (song_id, artist_id)
);

create index song_artists_artist_id_idx on public.song_artists (artist_id);

-- Bram's year corrections from his physical cards. The import never touches this table.
create table public.year_overrides (
  song_id uuid primary key references public.songs (id) on delete cascade,
  card_year integer not null check (card_year between 1800 and 2100),
  note text,
  set_by uuid references public.profiles (id) default auth.uid(),
  set_at timestamptz not null default now()
);

-- Read-only for players.
alter table public.editions enable row level security;
alter table public.songs enable row level security;
alter table public.cards enable row level security;
alter table public.artists enable row level security;
alter table public.song_artists enable row level security;
alter table public.year_overrides enable row level security;

create policy "Players read editions" on public.editions for select to authenticated using (true);
create policy "Players read songs" on public.songs for select to authenticated using (true);
create policy "Players read cards" on public.cards for select to authenticated using (true);
create policy "Players read artists" on public.artists for select to authenticated using (true);
create policy "Players read song artists" on public.song_artists for select to authenticated using (true);
create policy "Players read year overrides" on public.year_overrides for select to authenticated using (true);

revoke insert, update, delete, truncate on
  public.editions, public.songs, public.cards, public.artists, public.song_artists
  from anon, authenticated;
revoke all on public.year_overrides from anon;

-- True for the logged-in player when they are an admin (Bram).
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create policy "Admins add year overrides" on public.year_overrides
  for insert to authenticated with check ((select public.is_admin()));
create policy "Admins change year overrides" on public.year_overrides
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Admins remove year overrides" on public.year_overrides
  for delete to authenticated using ((select public.is_admin()));

-- The card year that counts: Bram's correction wins over the imported year.
create view public.song_card_years
with (security_invoker = true)
as
select
  s.id as song_id,
  coalesce(o.card_year, s.card_year) as card_year,
  case when o.song_id is not null then 'bram'::public.year_source else s.year_source end as year_source,
  case when o.song_id is not null then 'certain'::public.year_status else s.year_status end as year_status,
  o.song_id is not null as is_corrected
from public.songs s
left join public.year_overrides o on o.song_id = s.id;

-- Songs that may be dealt: a card year and playable in the Netherlands. Uncertain years still play.
create view public.playable_songs
with (security_invoker = true)
as
select
  s.id,
  s.spotify_track_id,
  s.title,
  y.card_year,
  y.year_source,
  y.year_status,
  s.cover_url
from public.songs s
join public.song_card_years y on y.song_id = s.id
where y.card_year is not null and s.playable_nl;

revoke all on public.song_card_years, public.playable_songs from anon;
grant select on public.song_card_years, public.playable_songs to authenticated;
