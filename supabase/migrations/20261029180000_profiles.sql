-- A player: one row per Supabase Auth user (Spotify login). See docs/spec/data-model.md.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  is_admin boolean not null default false,
  practice_session_count integer not null default 0 check (practice_session_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Own row only. Inserts come from the sign-up trigger, never from the browser.
create policy "Players read their own profile"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "Players update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- A player may rename themself, but never make themself admin or rewrite their session counter.
revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

-- Create the profile when someone signs up. Spotify puts the display name in `name` or `full_name`.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name')
  );
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
