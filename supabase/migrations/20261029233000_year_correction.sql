-- Bram's year correction from the answer screen (#26). See docs/spec/data-model.md.
-- The app writes year_overrides only through correct_card_year(), so set_by and set_at
-- always name the admin who saved it. The admin-only policies from the catalogue
-- migration stay as a second guard.

revoke insert, update, delete, truncate on public.year_overrides from authenticated;

-- Save or replace the correction for one song and return the effective card year.
create function public.correct_card_year(p_song_id uuid, p_card_year integer, p_note text default null)
returns public.song_card_years
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.song_card_years;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can correct a card year' using errcode = '42501';
  end if;

  if p_card_year is null or p_card_year not between 1800 and 2100 then
    raise exception 'Card year must be between 1800 and 2100' using errcode = '22023';
  end if;

  if not exists (select 1 from public.songs s where s.id = p_song_id) then
    raise exception 'Unknown song %', p_song_id using errcode = 'P0002';
  end if;

  insert into public.year_overrides (song_id, card_year, note, set_by, set_at)
  values (p_song_id, p_card_year, nullif(btrim(p_note), ''), (select auth.uid()), now())
  on conflict (song_id) do update
    set card_year = excluded.card_year,
        note = excluded.note,
        set_by = excluded.set_by,
        set_at = excluded.set_at;

  select * into result from public.song_card_years y where y.song_id = p_song_id;
  return result;
end;
$$;

revoke execute on function public.correct_card_year(uuid, integer, text) from public, anon;
grant execute on function public.correct_card_year(uuid, integer, text) to authenticated;
