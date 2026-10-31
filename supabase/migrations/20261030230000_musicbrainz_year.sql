-- MusicBrainz' first-release year per song, as a second opinion on the card year (#25).
-- The import fills it once per song. A hitify year only counts as certain when songseeker or
-- MusicBrainz gives the same year; songs where MusicBrainz disagrees are listed in the import report.
alter table public.songs
  add column musicbrainz_year integer check (musicbrainz_year between 1800 and 2100),
  add column musicbrainz_checked_at timestamptz;

-- Songs whose card year MusicBrainz contradicts and Bram has not corrected yet: the list to check
-- against the printed cards. Includes songseeker's years, which are trusted but not infallible.
create view public.year_disagreements
with (security_invoker = true)
as
select
  s.id as song_id,
  s.title,
  y.card_year,
  y.year_source,
  y.year_status,
  s.musicbrainz_year
from public.songs s
join public.song_card_years y on y.song_id = s.id
where y.card_year is not null
  and s.musicbrainz_year is not null
  and y.card_year <> s.musicbrainz_year
  and not y.is_corrected;

revoke all on public.year_disagreements from anon;
grant select on public.year_disagreements to authenticated;
