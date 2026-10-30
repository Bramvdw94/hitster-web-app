# Catalogue sources

Snapshots read by the catalogue import (`scripts/import-catalogue.ts`). The app never fetches these live. See `docs/spec/data-model.md`.

| File | What | From | Licence |
|---|---|---|---|
| `jumbo/gameset_database.json` | Card number to Spotify track ID per edition (SKU), plus `ArtistType` (solo/group) on some cards. No years. | `https://hitster.jumboplay.com/hitster-assets/gameset_database.json`, the file the official Hitster app reads | No stated licence; snapshot it, never proxy it |
| `songseeker/hitster-nl.csv` | Original NL (`aaaa0001`): card number, artist, title, card year | [andygruber/songseeker-hitster-playlists](https://github.com/andygruber/songseeker-hitster-playlists), `main`, downloaded 2026-10-29 | MIT, © 2024 Andreas Gruber, see `songseeker/LICENSE` |
| `hitify/<sku>.csv` | Every other Dutch edition: card number, artist, title, year, in the same columns as the songseeker CSV. Dates per edition in `hitify/snapshot.json` | `https://hitify.app/en/hitster-editions/<edition>`, saved by `npm run snapshot:hitify` (the "Snapshot hitify" Action) | Personal, non-commercial use per [hitify's terms](https://hitify.app/en/terms); fetched slowly, never live |

## How a card gets its year

1. Songseeker (Original NL only): `certain`.
2. Hitify: `certain` when songseeker or MusicBrainz gives the same year, otherwise `uncertain`.
3. Neither list has a year: MusicBrainz' earliest first-release date of a recording with that title and artist, `uncertain`.
4. Nothing: `missing`, and the song is not dealt.

The import asks MusicBrainz once for every song and stores its year in `songs.musicbrainz_year`, also for songseeker's years. The view `year_disagreements` lists every song whose card year MusicBrainz contradicts and Bram has not corrected: the list to check against the printed cards. A single, an album and a re-release can be a year apart, so a disagreement is a question, not proof of a wrong year.

A song printed in several editions is one song with one year: the best one over all editions. Bram's corrections (`year_overrides`) always win.

## Editions

All 14 Dutch editions and the Benelux Q-Music edition are in Jumbo's file (checked 2026-10-29), so none needs a playlist copied into Bram's own Spotify account. The Belgian editions (Flying Mic `aaaa0082`, Radio Contact `aaaa0052`) and the Global Platinum edition (`aaaa0054`) are left out. The SKUs and hitify pages are in `scripts/catalogue/editions.ts`.

## Refreshing a snapshot

Download the file again over the old one (for hitify: run the `Snapshot hitify` Action), commit it, and run the `Import catalogue` Action. The import is an upsert, so only real changes are written, and Bram's year corrections are never touched.
