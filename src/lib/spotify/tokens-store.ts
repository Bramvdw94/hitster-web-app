import "server-only";
import { createAdminClient } from "../supabase/admin";

export type StoredTokens = {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string;
};

// Reads and writes private.spotify_tokens through the service-role-only functions
// from supabase/migrations/20261029200000_spotify_tokens.sql.
export async function loadSpotifyTokens(playerId: string): Promise<StoredTokens | null> {
  const { data, error } = await createAdminClient()
    .rpc("get_spotify_tokens", { p_player_id: playerId })
    .maybeSingle<{ access_token: string; expires_at: string; refresh_token: string }>();

  if (error) {
    throw new Error(`Could not load Spotify tokens: ${error.message}`);
  }
  if (!data) {
    return null;
  }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(data.expires_at),
    refreshToken: data.refresh_token,
  };
}

export async function saveSpotifyTokens(
  playerId: string,
  tokens: { accessToken: string; expiresAt: Date; refreshToken: string | null },
): Promise<void> {
  const { error } = await createAdminClient().rpc("store_spotify_tokens", {
    p_player_id: playerId,
    p_access_token: tokens.accessToken,
    p_expires_at: tokens.expiresAt.toISOString(),
    p_refresh_token: tokens.refreshToken,
  });

  if (error) {
    throw new Error(`Could not store Spotify tokens: ${error.message}`);
  }
}
