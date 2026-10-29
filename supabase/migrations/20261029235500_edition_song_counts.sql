-- Per edition, how many of its songs can be dealt, for the edition list in Oefenen and Spel (#25).
-- A song printed twice in one edition counts once.
create view public.edition_song_counts
with (security_invoker = true)
as
select
  e.id as edition_id,
  e.sku,
  e.name,
  e.is_expansion,
  e.card_count,
  count(distinct p.id)::integer as playable_songs
from public.editions e
left join public.cards c on c.edition_id = e.id
left join public.playable_songs p on p.id = c.song_id
group by e.id;

revoke all on public.edition_song_counts from anon;
grant select on public.edition_song_counts to authenticated;
