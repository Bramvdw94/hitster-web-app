-- Spotify tokens per player, server only. See docs/spec/data-model.md.
-- `private` is not in the API's exposed schemas, so the browser can never reach it.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.spotify_tokens (
  player_id uuid primary key references auth.users (id) on delete cascade,
  -- The refresh token itself lives encrypted in Supabase Vault.
  refresh_token_id uuid not null,
  access_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table private.spotify_tokens enable row level security;
revoke all on private.spotify_tokens from public, anon, authenticated;

-- Remove the Vault secret together with the row (also when the auth user is deleted).
create function private.delete_spotify_refresh_token()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from vault.secrets where id = old.refresh_token_id;
  return old;
end;
$$;

create trigger on_spotify_tokens_deleted
  after delete on private.spotify_tokens
  for each row execute function private.delete_spotify_refresh_token();

-- The server (secret key, role service_role) reaches the tokens only through these two
-- functions. They sit in `public` so supabase-js can call them, but nobody else may execute them.

-- Store tokens after login or a refresh. A null refresh token keeps the stored one,
-- because Spotify does not always send a new one on refresh.
create function public.store_spotify_tokens(
  p_player_id uuid,
  p_access_token text,
  p_expires_at timestamptz,
  p_refresh_token text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  select refresh_token_id into v_secret_id
  from private.spotify_tokens
  where player_id = p_player_id
  for update;

  if v_secret_id is null then
    if p_refresh_token is null then
      raise exception 'No refresh token stored for player %', p_player_id;
    end if;
    v_secret_id := vault.create_secret(p_refresh_token, 'spotify_refresh_token:' || p_player_id);
    insert into private.spotify_tokens (player_id, refresh_token_id, access_token, expires_at)
    values (p_player_id, v_secret_id, p_access_token, p_expires_at);
  else
    if p_refresh_token is not null then
      perform vault.update_secret(v_secret_id, p_refresh_token);
    end if;
    update private.spotify_tokens
    set access_token = p_access_token, expires_at = p_expires_at, updated_at = now()
    where player_id = p_player_id;
  end if;
end;
$$;

create function public.get_spotify_tokens(p_player_id uuid)
returns table (access_token text, expires_at timestamptz, refresh_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.access_token, t.expires_at, s.decrypted_secret
  from private.spotify_tokens t
  join vault.decrypted_secrets s on s.id = t.refresh_token_id
  where t.player_id = p_player_id;
$$;

revoke execute on function private.delete_spotify_refresh_token() from public, anon, authenticated;
revoke execute on function public.store_spotify_tokens(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.get_spotify_tokens(uuid) from public, anon, authenticated;
grant execute on function public.store_spotify_tokens(uuid, text, timestamptz, text) to service_role;
grant execute on function public.get_spotify_tokens(uuid) to service_role;
