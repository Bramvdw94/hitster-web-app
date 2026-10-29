# Project setup

Settled with Bram on 2026-10-29 in [Set up the Vercel, Supabase and Spotify projects](https://github.com/Bramvdw94/hitster-web-app/issues/14).

## What exists

| Service | Name | Where | Notes |
|---|---|---|---|
| Supabase | `jaartal` (ref `vijpefspdqpgpffwoxaj`) | `eu-central-1` (Frankfurt), free plan | One database for production and previews |
| Vercel | `jaartal` (team `bram-s-projects13`) | functions in `fra1` (Frankfurt) | Framework Next.js; linked to this repo: `main` deploys to production, every PR gets a preview |
| Domain | `jaartal.elbra.nl` | TransIP DNS | `CNAME jaartal → 287747f47deec3fb.vercel-dns-017.com.` |
| Spotify | Bram's dev app from #9 | developer.spotify.com | Development mode, at most 5 allowlisted users |

## Stack inside the repo

- Next.js (App Router, TypeScript) at the repo root, `@supabase/ssr` for auth.
- Database changes as Supabase CLI migrations in `supabase/migrations`.
- Migrations reach the database only through a GitHub Action on the default branch (`supabase db push`), never from a preview.

## Environment variables (Vercel)

| Key | Set by | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Claude (done) | plain |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Claude (done) | plain |
| `SPOTIFY_CLIENT_ID` | Bram | plain |
| `SPOTIFY_CLIENT_SECRET` | Bram | sensitive |
| `SUPABASE_SECRET_KEY` | Bram | sensitive |

Secrets are pasted by Bram in the dashboards and never go through chat or the repo.

## Login redirects

- Spotify redirects to Supabase: `https://vijpefspdqpgpffwoxaj.supabase.co/auth/v1/callback`.
- Supabase site URL: `https://jaartal.elbra.nl`.
- Supabase redirect allowlist: `https://jaartal.elbra.nl/**`, `https://*-bram-s-projects13.vercel.app/**` (previews) and `http://localhost:3000/**`.
- Scopes: `streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state`.

## Spotify login

Added in [Log in with Spotify and keep the Spotify token server-side](https://github.com/Bramvdw94/hitster-web-app/issues/19).

- `/login` starts Supabase's Spotify OAuth (PKCE). Every other page redirects there when logged out; `/api/*` answers 401.
- `/auth/callback` exchanges the code and stores the Spotify tokens right away in `private.spotify_tokens` (refresh token encrypted in Supabase Vault). Supabase hands over the refresh token only in this one exchange.
- `GET /api/spotify/token` returns `{ accessToken, expiresAt }` for the logged-in player and refreshes with `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` when less than 5 minutes are left. `?vernieuw=1` forces a refresh to test that path.
- The server reaches `private.spotify_tokens` only through `public.get_spotify_tokens` and `public.store_spotify_tokens`, which only `service_role` (the `SUPABASE_SECRET_KEY`) may execute.
- A Spotify account that isn't on the dev app's allowlist sees "Je staat nog niet op de gastenlijst. Vraag Bram om je toe te voegen."

### Making Bram admin (one-off)

After Bram has logged in once, run this in the Supabase SQL editor (replace the email with the one on his Spotify account):

```sql
update public.profiles
set is_admin = true
where id = (select id from auth.users where email = 'bram@example.com');
```

## GitHub Actions

Added in [Scaffold the Jaartal app and its deploy pipeline](https://github.com/Bramvdw94/hitster-web-app/issues/18).

| Workflow | When | What |
|---|---|---|
| `CI` | every PR and push to `main` | `npm run lint`, `npm run typecheck`, `npm test` |
| `Migrations` | push to `main` that touches `supabase/migrations/`, or by hand | `supabase db push` against `vijpefspdqpgpffwoxaj`; never runs for a PR |
| `Keep-alive` | daily at 06:17 UTC, or by hand | reads one row of `profiles` with the publishable key, so the free project never pauses |
| `Import catalogue` | by hand, from `main` (inputs: editions, dry run) | runs `scripts/import-catalogue.ts`; the report per edition is in the run summary |

GitHub Actions secrets (set by Bram): `SUPABASE_ACCESS_TOKEN` (a Supabase personal access token) and `SUPABASE_DB_PASSWORD` (the database password, reset once in Supabase). The catalogue import also needs `SUPABASE_SECRET_KEY`, `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`, the same values as in Vercel.

## Still open

- Remove the `jaartal-afspeeltest` Vercel project once the app plays music.
