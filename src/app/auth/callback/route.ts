import { NextResponse, type NextRequest } from "next/server";
import { classifyLoginError } from "@/lib/auth/login-error";
import { expiryFrom } from "@/lib/spotify/token";
import { saveSpotifyTokens } from "@/lib/spotify/tokens-store";
import { createClient } from "@/lib/supabase/server";

// Spotify access tokens live an hour; Supabase doesn't pass on the exact lifetime.
const SPOTIFY_TOKEN_LIFETIME_S = 3600;

function toLogin(request: NextRequest, fout: string) {
  return NextResponse.redirect(new URL(`/login?fout=${fout}`, request.url));
}

// Spotify sends the player back here via Supabase. Supabase hands over the Spotify
// refresh token only in this one exchange, so it is stored before anything else.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");

  if (!code) {
    return toLogin(request, classifyLoginError(params.get("error"), params.get("error_description")));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    console.error("Spotify login: code exchange failed", error);
    return toLogin(request, classifyLoginError(error?.code ?? null, error?.message ?? null));
  }

  const { session } = data;
  try {
    if (!session.provider_token || !session.provider_refresh_token) {
      throw new Error("Supabase returned no Spotify tokens");
    }
    await saveSpotifyTokens(session.user.id, {
      accessToken: session.provider_token,
      expiresAt: expiryFrom(new Date(), SPOTIFY_TOKEN_LIFETIME_S),
      refreshToken: session.provider_refresh_token,
    });
  } catch (storeError) {
    // Without a stored refresh token the app can't play music, so don't stay half logged in.
    console.error("Spotify login: storing tokens failed", storeError);
    await supabase.auth.signOut();
    return toLogin(request, "onbekend");
  }

  return NextResponse.redirect(new URL("/", request.url));
}
