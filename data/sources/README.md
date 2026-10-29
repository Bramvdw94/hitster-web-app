# Catalogue sources

Snapshots read by the catalogue import (`scripts/import-catalogue.ts`). The app never fetches these live. See `docs/spec/data-model.md`.

| File | What | From | Licence |
|---|---|---|---|
| `jumbo/gameset_database.json` | Card number to Spotify track ID per edition (SKU), plus `ArtistType` (solo/group) on some cards. No years. | `https://hitster.jumboplay.com/hitster-assets/gameset_database.json`, the file the official Hitster app reads | No stated licence; snapshot it, never proxy it |
| `songseeker/hitster-nl.csv` | Original NL (`aaaa0001`): card number, artist, title, card year | [andygruber/songseeker-hitster-playlists](https://github.com/andygruber/songseeker-hitster-playlists), `main`, downloaded 2026-10-29 | MIT, © 2024 Andreas Gruber, see `songseeker/LICENSE` |

## Refreshing a snapshot

Download the file again over the old one, commit it, and run the `Import catalogue` Action. The import is an upsert, so only real changes are written, and Bram's year corrections are never touched.
