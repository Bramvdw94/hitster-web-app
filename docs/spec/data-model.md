# Data model and catalogue import

Settled with Bram on 2026-10-29 in [Define the data model and song import](https://github.com/Bramvdw94/hitster-web-app/issues/8). Terms are defined in `GLOSSARY.md`.

## Catalogue (shared, read-only for players)

| Table | What | Key fields |
|---|---|---|
| `editions` | One Dutch Hitster box | `id`, `sku` (e.g. `aaaa0001`), `name`, `card_count`, `is_expansion` |
| `songs` | One recording, stored once even when it is in several editions | `id`, `spotify_track_id` (unique), `title`, `card_year`, `year_source` (`songseeker` / `hitify` / `musicbrainz` / `bram`), `year_status` (`certain` / `uncertain` / `missing`), `playable_nl`, `cover_url`, `checked_at` |
| `cards` | A card in an edition, pointing at a song | `edition_id`, `card_number`, `song_id`; unique on (`edition_id`, `card_number`) |
| `artists` | An artist with aliases for typo-tolerant matching (#4) | `id`, `name`, `kind` (`person` / `group`), `aliases text[]` |
| `song_artists` | The credited artists of a song | `song_id`, `artist_id`, `position` |
| `year_overrides` | Bram's year corrections | `song_id`, `card_year`, `note`, `set_by`, `set_at` |

- The card year and the Leitner box belong to the **song**, not the card.
- A song is dealt only when it has a card year and `playable_nl = true`. Uncertain years still play.
- `kind` comes from Jumbo's `ArtistType` (solo/group), with MusicBrainz as a fallback. It drives the "surname alone counts for persons only" rule (#7).
- The effective card year is the `year_overrides` row if one exists, otherwise `songs.card_year`. The view `song_card_years` gives it per song, and `playable_songs` lists only the songs that may be dealt.
- Artists are keyed on their Spotify artist ID. When a card lists a solo artist differently from Spotify, the card's spelling is added as an alias.
- Only a player with `profiles.is_admin` (Bram) can write `year_overrides`. The answer screen shows him a "Jaar klopt niet" button.

## Per player (Row Level Security: only your own rows)

| Table | What | Key fields |
|---|---|---|
| `profiles` | A player, i.e. a Supabase Auth user (Spotify login) | `id` (= `auth.users.id`), `display_name`, `is_admin`, `practice_session_count` |
| `song_progress` | Leitner state per player per song | `player_id`, `song_id`, `box` (1–5), `last_seen_session`, `due_at_session` |
| `practice_sessions` | A practice session of 15 songs | `id`, `player_id`, `session_number`, `edition_ids` (empty = Alles), `weak_only`, `song_ids` (the 15, in order), `status` (`active` / `finished`), `started_at`, `finished_at` |
| `games` | A game in game mode | `id`, `owner_id`, `mode` (`solo` / `pass_and_play`), `variant` (`original` / `pro` / `expert`), `edition_ids`, `status`, `state jsonb` (timelines, tokens, deck, turn, opponent names), `songs_needed` (solo score), timestamps |
| `attempts` | One answer to one song | `id`, `player_id`, `song_id`, `practice_session_id` or `game_id`, `guessed_year`, `year_diff`, `artist_input`, `artist_correct`, `dont_know`, `points`, `box_before`, `box_after`, `answered_at` |

- Resuming after a reload: an `active` practice session plus its `attempts` is enough. A game keeps everything in `games.state`.
- Pass-and-play opponents are names inside `games.state`, not accounts, and are kept only while the game runs. They create no `attempts`, since only solo feeds weak songs (#5).
- The stats screen (still open on the map) reads from `attempts` and `song_progress`, so no counter tables are needed.

## Spotify tokens (server only)

| Table | What |
|---|---|
| `private.spotify_tokens` | `player_id`, `refresh_token` (encrypted with Supabase Vault), `access_token`, `expires_at` |

- The `private` schema is not exposed to the browser. Only the Vercel server function (service role) reads it and refreshes the access token hourly with the client secret.
- Supabase hands over the refresh token only once, at login, so the auth callback stores it right away.
- The browser only receives a short-lived access token for the Web Playback SDK.

## Catalogue import

1. A script in the repo (`scripts/import-catalogue.ts`), run by hand from a GitHub Action (`workflow_dispatch`) or locally. There is no admin page in the app.
2. Sources: Jumbo `gameset_database.json` (card to Spotify track), the songseeker CSV (Original NL), hitify (other editions), and MusicBrainz first-release as a fallback. The raw sources are snapshotted in the repo, so the app never fetches them live.
3. One `GET /tracks/{id}?market=NL` per track for the cover and NL playability, at most one every 3 seconds. A development-mode Spotify app that goes over its small burst budget is locked out for about a day, so a run reuses what an earlier run stored and only looks up tracks that are new or were checked more than 30 days ago (`checked_at`). `--recheck-spotify` looks everything up again.
4. Upsert on (`sku`, `card_number`) and `spotify_track_id`. Songs are deduplicated on the Spotify track ID. `year_overrides` is never touched.
5. A run looks up every track before it writes anything, then writes only rows that changed, so a second run reports no changes. `--dry-run` reports without writing.
6. Each run prints a report per edition: cards, songs without a year, uncertain years and songs not playable in NL.
7. An edition missing from Jumbo's file: Bram copies the official playlist into his own account once, and the script reads that playlist. As of 2026-10-29 every Dutch edition is in Jumbo's file, so this fallback is not built (#25).
8. A song in several editions takes the best year over all of them: songseeker, then hitify confirmed by songseeker, then hitify, then MusicBrainz. See `data/sources/README.md`.
9. The view `edition_song_counts` gives each edition's number of playable songs, for the edition list.
