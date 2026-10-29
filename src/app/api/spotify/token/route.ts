import { NextResponse, type NextRequest } from "next/server";
import { readServerEnv } from "@/lib/server-env";
import { SpotifyLoginExpiredError, needsRefresh, refreshAccessToken } from "@/lib/spotify/token";
import { loadSpotifyTokens, saveSpotifyTokens } from "@/lib/spotify/tokens-store";
import { createClient } from "@/lib/supabase/server";

const noStore = { "Cache-Control": "no-store" };

function loginAgain() {
  return NextResponse.json({ error: "opnieuw_inloggen" }, { status: 401, headers: noStore });
}

// Hands the logged-in player a Spotify access token that is valid for at least a few
// more minutes. The refresh token never leaves the server.
// `?vernieuw=1` forces a refresh, to test that path without waiting an hour.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = data?.claims.sub;
  if (!playerId) {
    return NextResponse.json({ error: "niet_ingelogd" }, { status: 401, headers: noStore });
  }

  const stored = await loadSpotifyTokens(playerId);
  if (!stored) {
    return loginAgain();
  }

  const now = new Date();
  const force = request.nextUrl.searchParams.get("vernieuw") === "1";
  if (!force && !needsRefresh(stored.expiresAt, now)) {
    return NextResponse.json(
      { accessToken: stored.accessToken, expiresAt: stored.expiresAt.toISOString() },
      { headers: noStore },
    );
  }

  const { spotifyClientId, spotifyClientSecret } = readServerEnv();
  try {
    const fresh = await refreshAccessToken(
      stored.refreshToken,
      { clientId: spotifyClientId, clientSecret: spotifyClientSecret },
      now,
    );
    await saveSpotifyTokens(playerId, fresh);
    return NextResponse.json(
      { accessToken: fresh.accessToken, expiresAt: fresh.expiresAt.toISOString() },
      { headers: noStore },
    );
  } catch (error) {
    if (error instanceof SpotifyLoginExpiredError) {
      return loginAgain();
    }
    throw error;
  }
}
