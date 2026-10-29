# Project setup

Settled with Bram on 2026-10-29 in [Set up the Vercel, Supabase and Spotify projects](https://github.com/Bramvdw94/hitster-web-app/issues/14).

## What exists

| Service | Name | Where | Notes |
|---|---|---|---|
| Supabase | `jaartal` (ref `vijpefspdqpgpffwoxaj`) | `eu-central-1` (Frankfurt), free plan | One database for production and previews |
| Vercel | `jaartal` (team `bram-s-projects13`) | functions in `fra1` (Frankfurt) | Framework Next.js; not yet linked to the repo |
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

## Left for the first build ticket

- Link the Vercel project to this repo once the Next.js app exists, so pushes deploy.
- A daily GitHub Action that runs one small catalogue query, so the free Supabase project never pauses after a week without use.
- The migration Action, with `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` as GitHub Actions secrets (Bram resets the database password once in Supabase).
- Remove the `jaartal-afspeeltest` Vercel project once the app plays music.
