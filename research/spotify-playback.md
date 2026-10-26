# Spotify playback on mobile, and app limits

Research for issue #3 (map: issue #1). Researched 2026-10-26 against Spotify's and Supabase's own docs. Community-forum posts are marked as such and are weaker evidence.

## TL;DR

- **Primary approach: Web Playback SDK in the browser.** Spotify's docs now list Chrome, Firefox, Safari and Edge on **Android and iOS** as supported [1]. Playback stays inside our page, the SDK sets **no** lock-screen/Media Session metadata unless we opt in (`enableMediaSession` defaults to `false`) [2], and our UI simply never renders the track info. On iOS, playback must start from a user tap (`activateElement()` called in that tap) [1][2].
- **Fallback: Spotify Connect via the Web API.** Call `PUT /me/player/play?device_id=…` with `uris: ["spotify:track:…"]` to play on the phone's own Spotify app [3]. This works with Premium, but the Spotify app and the lock screen show the title and artist, so hide it the Hitster way: "flip your phone" before the song starts [8].
- **Limits (Development Mode, 2026):** the app owner (Bram) needs Premium; there are **at most 5 authorised users per Client ID**, each added to the allowlist by hand; 1 Client ID per developer (raised to 25 in July 2026) [4][5]. **Extended quota is open only to registered organisations with at least 250k MAU** (since 15 May 2025) [5][6], so it is not an option for us. Friends are therefore limited to 4 besides Bram.
- **Policy risk:** the Spotify Developer Policy says "Do not create a game, including trivia quizzes" (III.2) and requires showing cover art and metadata during playback (II.5) [7]. A private practice app for 5 users is low-profile, but it does not technically comply. Bram should knowingly accept this, keep the app private and non-commercial, and treat it as a reason not to grow past the allowlist.
- **Tokens:** Supabase hands us `provider_token` / `provider_refresh_token` once, in the OAuth callback. It neither stores nor refreshes them [9]. We must persist the refresh token server-side and refresh it ourselves with the client secret (Spotify access tokens last 1 hour) [10].

## 1. Web Playback SDK on mobile browsers

**What Spotify says (primary):**
- Supported: "Chrome, Firefox, Safari, and Microsoft Edge", on desktop and **mobile (Android and iOS)** [1].
- It requires Premium. Mobile-only Premium plans (e.g. Premium Mini) are excluded [1].
- iOS: playback doesn't start automatically after a transfer. "The user must interact with the SDK events to play audio" [1].
- `player.activateElement()` must be called **in advance**, in a user-gesture event path. Otherwise the player sits paused after a transfer. The `autoplay_failed` event fires when the browser blocks playback [2].
- iOS: volume can't be set from JS (`setVolume` is a no-op; the physical buttons control it) [2].
- `getOAuthToken` is called on `connect()` and again whenever the token expires (max 60 min). It must return a valid Premium user token [2].
- Needs EME/Widevine (`encrypted-media`). The page must not run inside a cross-origin iframe without `allow="encrypted-media; autoplay"` [1].
- Scopes: `streaming` ("currently available to the Web Playback SDK") [11], plus `user-read-email` and `user-read-private` (named as the SDK's required set on the community forum, not verified on a Spotify doc page) [13].
- The SDK is not deprecated (community answer) [13]. Its docs still say it "must not be used in commercial projects without Spotify's prior written approval" [1].

**Field reports (weaker evidence):**
- iOS Safari has a long history of breakage, e.g. a thread where iOS 15 broke playback even with `activateElement` [12].
- In 2026 one developer reported that `player.connect()` never resolves for a Development Mode app after the Feb/Mar 2026 changes. It has no reply yet [14].

**Conclusion:** officially supported, but flaky in practice, especially on iOS. **The first build ticket should be a throwaway spike on Bram's actual phone**: load the SDK, tap "Start", play one known track URI with `PUT /me/player/play?device_id=<sdk device>`, and check (a) it plays, (b) it keeps playing with the screen locked, and (c) what the lock screen shows.

**Experience when it works:** one tap starts the round. The song plays from our page. We control `position_ms` (e.g. skip the intro) and can pause/seek. The track info arrives in `player_state_changed`, and we simply don't render it.

## 2. Fallback: Spotify Connect (play on the user's Spotify app)

- `PUT /me/player/play` needs scope `user-modify-playback-state` and "only works for users who have Spotify Premium" [3]. Body: `uris` (track URIs) or `context_uri` + `offset`, plus `position_ms`. Query: `device_id` (default = the currently active device). Spotify says the execution order with other Player calls is not guaranteed [3].
- `GET /me/player/devices` (scope `user-read-playback-state`) lists devices. "Some device models are not supported." `is_restricted: true` devices accept no Web API commands, and IDs aren't guaranteed stable [15].
- In practice (not in the docs): the phone's Spotify app shows up as a device only if it was opened recently. So the UX is "open Spotify once, come back, tap Play". The Player endpoints were **not** touched by the Feb 2026 Dev Mode changes [4].
- **Experience:** our page sends the command, and audio comes out of the Spotify app in the background. The Spotify app, its notification and the lock screen **show the title, artist and cover**. We can't hide that.
- How the official Hitster app handles this: its FAQ describes "Flip Your Phone", Gyrosensor (music starts when the phone is face down) and Countdown modes ("flip your phone before the countdown ends") [8]. Q42, its developer, says that "when the paid Spotify app is available on a phone, the name and song are not displayed" [16]. That is a native app, presumably with a Spotify partnership, and we can't reproduce it on the web.
- Our web equivalent: a 3-second countdown or a `DeviceOrientation`-based "turn the phone face down" trigger before the play call. On iOS the orientation trigger needs a permission tap.

## 3. Hiding title and artist

| Surface | Web Playback SDK | Connect (Spotify app) |
|---|---|---|
| Our UI | We decide. Don't render `track_window.current_track` | We decide |
| Lock screen / notification | No Media Session metadata by default (`enableMediaSession: false`) [2]. Verify in the spike what the browser shows | Shows the song. Can't hide |
| Spotify app | Not involved | Shows the song. Can't hide |

Note on policy II.5 ("no playback of Spotify Content without showing relevant cover art and metadata") [7]: hiding metadata is exactly what the policy forbids. See the TL;DR on accepting this risk. A cheap, honest compromise is to **reveal** the title, artist and cover on the answer screen of every round.

## 4. Developer-mode limits (as of late 2026)

From Spotify's Quota modes page [5] and the February 2026 migration guide [4]:
- The app owner must have Premium. If it lapses, the app stops working until they resubscribe [4][5]. Allowlisted test users do **not** need Premium for API access [17], but playback itself still requires Premium for each listener [1][3].
- "Up to 5 authenticated Spotify users". Each one is added to the app's allowlist in the dashboard. A non-allowlisted user can log in, but their API calls get **403** [5].
- Client IDs per developer: 1 for new developers since 11 Feb 2026, raised to 25 in July 2026 [4].
- Dates: new Dev Mode apps got the restrictions on 11 Feb 2026. Existing apps were scheduled for 9 Mar 2026, though staff later postponed the *endpoint* changes for existing apps. The Premium, user-cap and Client-ID rules still applied [4][17]. Our app is new, so the full restrictions apply.
- **Extended quota:** since 15 May 2025, only organisations can apply. The criteria include a registered business, a launched service, **at least 250k MAU**, key markets and commercial viability. Review takes up to 6 weeks [5][6]. Not reachable for this project.

**Endpoints/fields removed or changed for new Dev Mode apps [4]** (relevant ones in bold):
- **`GET /playlists/{id}/tracks` → `GET /playlists/{id}/items`, and items are returned only for playlists the user owns or collaborates on.** For anyone else's playlist (e.g. the official Hitster playlists) `items` is absent. This matters for the songlists research: copy the playlists into Bram's account, or keep the song lists in our own DB.
- **Batch `GET /tracks?ids=` removed**: fetch tracks one by one (`GET /tracks/{id}`), so be mindful of rate limits.
- **`GET /search`: `limit` max 50 → 10, default 5.**
- Removed fields: track `popularity`, `available_markets`, `linked_from`; album `label`, `popularity`; artist `followers`, `popularity`; `GET /me` loses `email`, `country`, `product`. **So we can't check `product === "premium"` from `/me`.** Detect non-Premium through SDK `account_error` or a 403 on play instead. (`external_ids` was removed and then restored in March 2026.)
- Removed: `GET /browse/new-releases`, `/browse/categories*`, `/artists/{id}/top-tracks`, `GET /users/{id}`, `GET /users/{id}/playlists`, `GET /markets`. Library saves moved to `PUT/DELETE /me/library`.
- Player endpoints (`/me/player/*`) are unchanged.

## 5. Supabase Auth Spotify provider and tokens

- Setup: create the Spotify app, add the redirect URI `https://<project-ref>.supabase.co/auth/v1/callback` (local: `http://localhost:54321/auth/v1/callback`), then paste the client ID/secret into Supabase → Auth → Providers → Spotify [18].
- Request the scopes at sign-in [19]:
  ```ts
  supabase.auth.signInWithOAuth({
    provider: 'spotify',
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: 'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state playlist-read-private',
    },
  })
  ```
  - `streaming`: Web Playback SDK [11]
  - `user-read-email`, `user-read-private`: SDK requirement [13], `/me`
  - `user-modify-playback-state`: `PUT /me/player/play`, transfer, pause, seek [11]
  - `user-read-playback-state`: `GET /me/player/devices`, current playback [11]
  - `playlist-read-private` (+ optionally `playlist-modify-private`): reading, or copying the Hitster playlists into the user's account [11]
- Tokens: the session from the callback carries `provider_token` (Spotify access token) and `provider_refresh_token` [20]. Supabase docs: "Provider tokens are intentionally not stored in your project's database" and "Supabase Auth does not manage refreshing the provider token". Send them to a trusted server you control [9]. "Because signInWithOAuth causes a redirect, you need to fetch the provider tokens from the callback" [19].
- Refresh: Spotify access tokens last **1 hour**. Supabase uses the Authorization Code flow with our client secret, so refresh calls need `Authorization: Basic base64(client_id:client_secret)`. They must run **server-side** (a Next.js route handler on Vercel or a Supabase Edge Function). The response may or may not include a new refresh token, so keep the old one if none comes back [10].
- Recommended design: in the `/auth/callback` route, read `provider_refresh_token` from the exchanged session and store it in a Supabase table that only the server can read (RLS on, service role). Expose a `/api/spotify/token` route that returns a fresh access token. The SDK's `getOAuthToken` callback calls it [2].

## Recommendation

1. Use the **Web Playback SDK** as the main path: hidden metadata, no app switching, full control. Gate the first round behind a "Tik om te starten" tap that calls `activateElement()`.
2. Make the first build ticket a **device spike** on Bram's iPhone/Android, covering playback, screen lock, the lock-screen display, and `connect()` in Dev Mode.
3. Build in a **Connect fallback** (device picker, plus a "flip your phone" countdown) for when the SDK fails on a device.
4. Accept the **5-user cap** (Bram + 4 friends, allowlisted by hand). Extended quota is out of reach.
5. Record the **Developer Policy III.2 / II.5 risk** as an ADR. Keep the app private and non-commercial, and show the metadata on the answer screen.

## Sources

1. Spotify, Web Playback SDK overview: https://developer.spotify.com/documentation/web-playback-sdk
2. Spotify, Web Playback SDK reference: https://developer.spotify.com/documentation/web-playback-sdk/reference
3. Spotify, Start/Resume Playback: https://developer.spotify.com/documentation/web-api/reference/start-a-users-playback
4. Spotify, February 2026 Web API Dev Mode Changes, migration guide: https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide
5. Spotify, Quota modes: https://developer.spotify.com/documentation/web-api/concepts/quota-modes
6. Spotify Community (staff), Updating the Criteria for Web API Extended Access: https://community.spotify.com/t5/Spotify-for-Developers/Updating-the-Criteria-for-Web-API-Extended-Access/m-p/6967558
7. Spotify Developer Policy (effective 15 May 2025), II.5 and III.2: https://developer.spotify.com/policy/
8. Hitster FAQ: https://hitstergame.com/en-us/faq-v3/
9. Supabase, Social Login (provider tokens): https://supabase.com/docs/guides/auth/social-login
10. Spotify, Refreshing tokens: https://developer.spotify.com/documentation/web-api/tutorials/refreshing-tokens
11. Spotify, Scopes: https://developer.spotify.com/documentation/web-api/concepts/scopes
12. Spotify Community, Web Playback SDK not playing on iOS 15: https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-not-playing-on-iOS-15/m-p/5427466
13. Spotify Community, Web Playback Deprecated? (SDK scopes): https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-Deprecated/td-p/7029524
14. Spotify Community, player.connect never resolves in Development Mode (2026): https://community.spotify.com/t5/Spotify-for-Developers/Web-Playback-SDK-player-connect-never-resolves-in-Development/td-p/7392190
15. Spotify, Get Available Devices: https://developer.spotify.com/documentation/web-api/reference/get-a-users-available-devices
16. Q42, Hitster app case study: https://www.q42.nl/en/work/hitster-app
17. Spotify Community, February 2026 update thread (staff postponement, Premium for owner only): https://community.spotify.com/t5/Spotify-for-Developers/February-2026-Spotify-for-Developers-update-thread/td-p/7330564
18. Supabase, Login with Spotify: https://supabase.com/docs/guides/auth/social-login/auth-spotify
19. Supabase JS, signInWithOAuth: https://supabase.com/docs/reference/javascript/auth-signinwithoauth
20. supabase-js `Session` type (provider_token / provider_refresh_token): https://doc.deno.land/https://esm.sh/@supabase/supabase-js@2.110.7/dist/index.d.mts/~/Session
