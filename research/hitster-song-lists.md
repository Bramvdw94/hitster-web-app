# Dutch Hitster song lists and card years

Research for issue #2 (map: #1). Date: 2026-10-26.

## Answer in short

- **Track list per edition (authoritative):** Jumbo's own `gameset_database.json`, which the official Hitster app uses. It maps each card number in each edition (SKU) to a Spotify track ID. It does **not** contain years.
- **Card years:** no official source publishes them. The best community sources are:
  - `hitster-nl.csv` in [andygruber/songseeker-hitster-playlists](https://github.com/andygruber/songseeker-hitster-playlists) (MIT). It covers only the **Dutch Original** edition: 308 cards with card number, artist, title and year.
  - [hitify.app](https://hitify.app/en/hitster-editions), which lists **all** Dutch editions with card number, artist, title and year. Its years are "checked against MusicBrainz and Discogs". That means they are probably close to the card years, but not guaranteed to be the card years.
- **Recommendation:** build the song table from Jumbo's card-to-Spotify mapping, keyed on `(sku, card_number)`. Seed years from the songseeker CSV for Original NL and from hitify for the other editions, and fall back to MusicBrainz first-release year. Store `year_source` on each row, and give Bram an in-app "fix year" action so he can correct a year from his physical cards. Never use Spotify's album `release_date` as the answer.
- **Licensing:** this is fine for a private, non-commercial practice app, but there is one serious flag. Spotify's Developer Policy III.2 says "Do not create a game, including trivia quizzes." That affects the whole app concept, not just the song data (see below).

### Impact of the Spotify API restrictions (Feb 2026)

According to the Spotify research thread, new development-mode apps:
- can only read tracks of playlists the user **owns or collaborates on**, so the official Hitster playlists come back empty;
- get at most 10 search results;
- no longer have the bulk tracks endpoint.

This makes the recommendation above stronger. **The app should never need to read a Hitster playlist or search Spotify at runtime.**
- **Seed our own Supabase `songs` table offline** with `(edition, sku, card_number, spotify_track_id, artist, title, year, year_source)`:
  - `spotify_track_id` comes from the Jumbo `gameset_database.json`, i.e. the exact tracks the official app plays.
  - Artist, title and year come from songseeker (Original NL) and hitify (other editions).
  - Both are keyed on card number, so joining them needs no Spotify metadata call.
  - Hitify's per-edition pages also embed Spotify track links, which can help fill gaps.
- Playback only needs the track URI (`spotify:track:<id>`), and the playback SDK / Connect calls are not playlist reads.
- **Fallback:** if any edition lacks a Jumbo mapping, Bram copies the official playlist into his own account once (in the Spotify client: select all, then "Add to playlist → New playlist"). He then owns it and the API can read it. This is a one-off import tool, not a runtime dependency.
- Cover art and the like, if wanted, come from single-track `GET /tracks/{id}` calls during the one-off seed (cached), or from the oEmbed endpoint. Check that single-track lookup still works for new apps in the Spotify research ticket.

## 1. Dutch editions

The Dutch Hitster site lists these products: Original, Summer (Summer Party), Guilty Pleasures, 100% NL, Celebration, Bingo, Battle of the Generations, Flying Mic, Movies & TV Soundtracks, and Rock. Source: [hitstergame.com/nl-nl](https://hitstergame.com/nl-nl/).

Hitify lists 14 Netherlands editions plus one Benelux edition. That list includes expansions, refreshes and Top 40 NL ([hitify.app/en/hitster-editions](https://hitify.app/en/hitster-editions)):

| Edition (hitify) | Cards |
|---|---|
| Original | 308 |
| Original Refresh | 314 |
| Guilty Pleasures | 334 |
| Summer Party | 308 |
| 100% NL | 308 |
| Top 40 NL | 308 |
| Celebration | 308 |
| Battle of the Generations | 420 |
| Flying Mic | 226 |
| Bingo | 225 |
| Christmas Expansion | 154 |
| Hip Hop Expansion | 154 |
| Rock Expansion | 154 |
| Soundtracks Expansion | 154 |
| Q-Music Het Foute Uur (Benelux) | 308 |

### Official Spotify playlists

These come from the official Dutch FAQ ([hitstergame.com/nl-nl/pages/faq](https://hitstergame.com/nl-nl/pages/faq)):

| Edition | Playlist ID |
|---|---|
| Hitster Original | `321iL49aeqqqtKfrQLO91I` |
| Hitster 100% NL | `6plvDP2Wfm32ZliZ8ZfszH` |
| Hitster Bingo | `4wEfXjSyGPI22nPftvtl30` |
| Hitster Celebration | `0xkEvV9nuXz8F7ud4HC2IL` |
| Hitster Christmas | `1TUhoIBbCFCCyDM4ELKdUE` |
| Hitster Guilty Pleasures | `2JSmyZbQzHwBztJAlATde4` |
| Hitster Movies & TV Soundtracks | `7Az33NkIvFxjSR2vfxpXyt` |
| Hitster Rock | `2SHUg7ATjUKt11XTS6cqyp` |
| Hitster Summer Party | `2hJrEVC4F2JGDpuUZKJzLF` |
| Hitster Urban & Hip-Hop | `35y8diwRzYjfNUvcvtvRXx` |

Caveats:
- The playlists carry no card numbers or years, and their order is not guaranteed to match the cards. Hitify links different playlists, which are probably its own: `5EweVKdTv8GxwJsOU2UQLA` for Original NL and `08Pt6UEe9xswc3END7BkUb` for Guilty Pleasures NL.
- There is no official playlist for Battle of the Generations, Flying Mic, Top 40 NL or Original Refresh.
- Spotify playlists can change after print, so the card-to-track mapping (next section) is the better key.

### Card-to-Spotify mapping (official app data)

The physical card's QR code encodes `www.hitstergame.com/<lang>/<sku>/<cardnumber>`. The official app resolves it through `https://hitster.jumboplay.com/hitster-assets/gameset_database.json` ([webster README](https://codeberg.org/mr-gray/webster)).

The JSON is shaped like this:
`{updated_on, gamesets: [{sku, gameset_data: {gameset_language, gameset_name, cards: [{CardNumber: "00150", Spotify: "<track id>", ArtistType?: "solo"|"group"}]}}]}`

There are no year, title or artist fields. Title and artist come from the Spotify API. This was verified by fetching the file. The fetch tool truncated it at about 62k characters, so I could not see the NL entries myself.

Dutch SKUs, according to the webster README:

| SKU | Edition |
|---|---|
| `aaaa0001` | Original |
| `aaaa0006` | Guilty Pleasures |
| `aaaa0011` | Summer |
| `aaaa0020` | Bingo |
| `aaaa0036` | Rock |

The other NL SKUs still need to be read from the full JSON. Do this from a machine that can reach the host, or scan one card QR per box.

## 2. Card years

**Official sources:** none. The Jumbo JSON has no years. The FAQ does not explain how years are chosen. The only note on cards is that an "R" marks a song that also appears in another Hitster edition ([NL FAQ](https://hitstergame.com/nl-nl/pages/faq)).

**songseeker `hitster-nl.csv`:**
- Columns: `Card#, Artist, Title, Year, URL (YouTube), Youtube-Title, Hashed Info`.
- 308 rows, i.e. the Dutch Original.
- The README says the German data was compiled from the original game, the Hitster website and the Spotify playlist. The NL file follows the same format.
- Licence: MIT (© 2024 Andreas Gruber).
- Spread by decade: 1950s 16, 1960s 40, 1970s 46, 1980s 54, 1990s 53, 2000s 46, 2010s 43, 2020s 7, plus 3 earlier.
- The repo also has CSVs for DE, FR, CA, HU, PL and Nordics expansions, but no other NL edition.

**hitify.app:**
- Covers every NL edition, with per-card rows of number, artist, title and year.
- Years are "checked against MusicBrainz and Discogs", and users can submit corrections.
- No export or API. Its terms limit use to "personal, non-commercial purposes" and forbid overloading the service ([terms](https://hitify.app/en/terms)).
- Song metadata is acknowledged as belonging to the rightsholders.

**Cross-check, Original NL:** I compared 25 sample cards (1–10, 100–105, 300–308). The two sources agree on 24. The one difference is card 3, Meat Loaf "Paradise By The Dashboard Light": songseeker has 1978 and hitify has 1977. The album came out in 1977 and the single in 1978. Neither source can be shown to hold the printed card year without checking the physical card, so this is the kind of discrepancy the in-app "fix year" flow should handle.

Hitify's titles are the Spotify track names, for example "Let It Be - Remastered 2009", "Lambada - Version 1989" and "One More Time - Radio Edit". Its years are still the original years (1970, 1989, 2000). This shows hitify does not use Spotify's `release_date`.

### Drift of Spotify and MusicBrainz from card years

I could not measure this live, because api.spotify.com and musicbrainz.org are blocked from this research environment. What is known:

- **Spotify `album.release_date` is the date of the album the track sits on.** The playlists use many remaster, radio-edit and compilation versions (see the titles above), and for those the album date can be decades after the original. Spotify's own community forum has long-running threads on "incorrect release year" and "wrong dates for countless albums" ([example](https://community.spotify.com/t5/Content-Questions/Bug-report-wrong-dates-for-countless-albums/m-p/7164056/highlight/true)). Treat it as unusable without correction.
- **MusicBrainz recording `first-release-date`** is the right concept: the earliest release of that recording. It still has two problems:
  - Remastered or re-recorded versions can be separate recordings, so you need to match on the original recording or work.
  - "First release" may be the album when the card uses the single, as with the Meat Loaf 1977/1978 case.
  - Expect it to be mostly exact, with ±1-year misses.
- **Suggested check during the build:** run the songseeker CSV (308 known years) against both APIs. Report the share that is exact, within 1 year, and more than 1 year off. That turns this qualitative note into numbers before deciding the fallback order.

## 3. Licensing and terms

- **Spotify Developer Policy** ([developer.spotify.com/policy](https://developer.spotify.com/policy), effective 15 May 2025):
  - **III.2 "Do not create a game, including trivia quizzes."** This applies to any app built on the Spotify Platform, whatever its data source. It is the biggest risk to the project concept and should be decided in the Spotify/auth research ticket.
  - **III.10:** Spotify is for personal, non-commercial use.
  - **IV.2:** commercial use is not allowed.
  - **II.4.3 / II.5:** metadata may only be used with the underlying content, never as a standalone product.
  - **III.14:** no ML training.
- **Song lists and years:** a list of the songs in a published product is factual data. Hitify takes this position explicitly, and individual facts are generally not protected by copyright. In the EU, a substantial extraction from a curated database could in theory touch database rights.
  - The songseeker CSV is MIT-licensed, so reuse is clearly fine.
  - Hitify allows personal, non-commercial use and has no API. Copy its data by hand or with a light one-off scrape. Do not hit it live from the app.
  - The Jumbo JSON is an unauthenticated asset with no stated licence. Snapshot it once and do not proxy it.
- **Trademark:** "Hitster" is a trademark of Jumbo Diset, S.L. Do not use the name or logo as the app's branding, and do not imply affiliation. This matters if friends get access.
- **Practical risk for a private app used by Bram and a few friends:** the data is low risk. The Spotify "no games" clause is the real exposure: Spotify could refuse a quota extension or revoke the app. Development mode with an allowlist keeps it in private, personal use.

## Sources

- https://hitstergame.com/nl-nl/
- https://hitstergame.com/nl-nl/pages/faq
- https://hitstergame.com/en-us/faq-v3/
- https://hitster.jumboplay.com/hitster-assets/gameset_database.json
- https://codeberg.org/mr-gray/webster
- https://github.com/andygruber/songseeker-hitster-playlists (`hitster-nl.csv`, `playlists.csv`, `LICENSE`)
- https://hitify.app/en/hitster-editions, https://hitify.app/en/hitster-editions/original-netherlands, https://hitify.app/en/hitster-editions/guilty-pleasures-netherlands, https://hitify.app/en/terms
- https://developer.spotify.com/policy
- https://community.spotify.com/t5/Content-Questions/Bug-report-wrong-dates-for-countless-albums/m-p/7164056/highlight/true
