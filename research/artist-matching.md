# Research: typo-tolerant artist matching

Ticket: #4. Context map: #1. Date: 2026-10-26.

## Answer in short

- **This is a 1-to-1 check, not a search.** In practice mode the app already knows which song is playing, so the typed guess only needs to be compared with that song's artist(s). It runs as a pure TypeScript function that both the client and the server can call. Postgres `pg_trgm` / `fuzzystrmatch` are not needed for the check. They would only become useful for a search or autocomplete feature (see below).
- **Pipeline:** normalise both strings → split them into artists → compare each guess part with each credited artist and with the full credit line → **accept if the best score is ≥ 0.80**.
- **Measure:** normalised edit similarity `1 − d / max(len)`. `d` is the **OSA (Damerau) distance**, which counts a swap of two adjacent letters as one edit. Compute it on the normalised string with spaces removed.
- **Library:** `fastest-levenshtein@1.0.16` (MIT, no dependencies, ships TS types) handles plain Levenshtein. However, OSA got 1 calibration case wrong at 0.80 where plain Levenshtein got 3 wrong ("beyocne", "shakria"), because phone typos are often swapped letters. **Recommendation: write the ~15-line OSA function in-house** (sketch below) and add no dependency. If a package is preferred, `fastest-levenshtein` with the same 0.80 threshold is the fallback, at the cost of rejecting single-swap typos in short names.
- **Several artists:** naming **one** credited artist is enough. "queen", "queen and david bowie" and "david bowy" all match `Queen, David Bowie`.
- **Aliases:** add an optional `aliases text[]` per artist (or per song), curated by hand. MusicBrainz "search hint" aliases are a possible seed source.

## 1. Normalisation (both sides, same function)

Apply these in order. Each step was tested in the calibration in §4.

1. `s.normalize('NFKD').replace(/\p{M}/gu, '')` removes accents (é → e, ü → u, ñ → n). Source: [MDN `String.prototype.normalize`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize).
2. **Fold the letters that NFKD leaves alone.** `ø`, `ß`, `æ`, `ł` have no Unicode decomposition. Checked in Node 22: `'ø'.normalize('NFKD')` is still U+00F8. Without this step "blof" would not match **BLØF**, a core Dutch Hitster act. Map: `ø→o, æ→ae, œ→oe, ß→ss, ł→l, đ/ð→d, þ→th, ı→i`.
3. `toLowerCase()`.
4. Connectors: `&` and `+` → ` and `, and the Dutch ` en ` → ` and `. "simon en garfunkel" then equals "Simon & Garfunkel".
5. Remove apostrophes without leaving a space: `Guns N' Roses` → `guns n roses`.
6. Turn every remaining run of non-letters and non-digits into a single space, then trim. This turns `AC/DC` into `ac dc` and `a-ha` into `a ha`.
7. Remove a leading article: `the`, `de`, `het`. Do it on both sides so "beatles" = "The Beatles" and "dijk" = "De Dijk".
8. For the distance, also **remove the spaces**. "doemaar" = "Doe Maar", "acdc" = "AC/DC", "aha" = "a-ha".

## 2. Several artists and splitting

- **Card side:** take the artists from Spotify's `track.artists` array (each item has a `name`; [Spotify Get Track](https://developer.spotify.com/documentation/web-api/reference/get-track)). Do **not** split the credit string, because acts like `Simon & Garfunkel` and `Earth, Wind & Fire` are a single Spotify artist and would break apart. The candidates are each artist name, the joined credit line, and any aliases.
- **Guess side:** the candidates are the whole guess, plus the parts you get by splitting on `, ; / feat ft featuring with met vs x and`. Because the whole guess is always tried too, "earth wind and fire" still matches as one string.
- **Rule:** accept when `max(score(guessPart, candidate)) ≥ 0.80`. One correct artist is enough, which matches how people play Hitster aloud. A guess that adds a wrong second artist ("queen and madonna") is still accepted. That is lenient on purpose. Making it strict is a product decision, not a matching one.
- Part-names do **not** count: "bowie" scores 0.50 against David Bowie and "marco" 0.42 against Marco Borsato. This follows from the threshold, not from a special rule. Surnames can be added as aliases if Bram wants them.

## 3. Aliases

- Store `aliases text[]` on the artist or song row and add them to the candidate list. Use it for stage-name changes and spellings that edit distance cannot bridge. Examples: "GNR" → Guns N' Roses, "Puff Daddy" ↔ "Diddy", "Prince" for a "The Artist Formerly Known As Prince" credit, and "Hazes" if surnames should count.
- MusicBrainz models this directly. Its alias types are *artist name*, *legal name* and *search hint*, and a search hint is meant "for common misspellings … and other incorrect forms of a name" ([MusicBrainz: Aliases](https://musicbrainz.org/doc/Aliases)). It could seed the list, but at the size of the Dutch Hitster editions, hand curation is simpler. Start empty and add aliases when a real guess gets rejected unfairly.

## 4. Threshold calibration

I ran 55 hand-picked pairs (35 that should match, 20 near-misses that should not) through the pipeline above. The script was run locally and not committed. These are the key rows; the score is OSA similarity after normalisation:

| Guess | Card | Score | Should match |
|---|---|---|---|
| beyonse | Beyoncé | 0.86 | yes |
| beyocne | Beyoncé | 0.86 (Levenshtein: 0.71) | yes |
| shakria | Shakira | 0.86 (Levenshtein: 0.71) | yes |
| doe maar / doemaar | Doe Maar | 1.00 | yes |
| queen and david bowie | Queen, David Bowie | 1.00 | yes |
| david bowy | Queen, David Bowie | 0.80 | yes |
| blof | BLØF | 1.00 (with ø-fold) | yes |
| guus mewis | Guus Meeuwis | 0.82 | yes |
| marco borsatto | Marco Borsato | 0.92 | yes |
| frans bauwer | Frans Bauer | 0.91 | yes |
| anuk | Anouk | 0.80 | yes |
| eminen | Eminem | 0.83 | yes |
| the beetles | The Beatles | 0.86 | yes |
| wham | Ham *(made-up short name)* | 0.75 | no |
| bloem | BLØF | 0.60 | no |
| madness | Madonna | 0.43 | no |
| aqua | ABBA | 0.50 | no |
| toto | Tool | 0.50 | no |
| marco | Marco Borsato | 0.42 | no |
| bowie | Queen, David Bowie | 0.50 | no |
| simon | Simon & Garfunkel | 0.29 | no |
| **andre hazes jr** | **André Hazes** | **0.83** | no, **wrongly accepted** |

Errors per threshold:

| Threshold | OSA errors | Levenshtein errors |
|---|---|---|
| 0.75 | 2 | 4 |
| **0.80** | **1** | 3 |
| 0.85 | 4 (rejects "david bowy", "guus mewis", "eminen", "anuk") | 6 |

**0.80 gives the fewest errors.** At this threshold:

- Names of 3 characters or fewer must be exact (U2, BZN).
- 4-character names cannot take a substitution (`1 − 1/4 = 0.75`), but a missing letter in a 5-character name is fine ("anuk"). "abba" vs "aqua" therefore cannot slip through.
- Names of 10 or more characters allow 2 edits.

The one remaining error is **father and son with the same name** (André Hazes vs André Hazes Jr.). Editing toward a name that is also a real artist cannot be told apart from a typo. If a deck holds both, an exact-match rule on a `jr`/`sr` token could fix it, but that seems low priority.

**Ruled out: Jaro-Winkler** (`@skyra/jaro-winkler@1.1.1`). It rewards a shared prefix, so it accepts exactly the near-misses we want to reject: "marco" vs "marcoborsato" scores 0.90, "simon" vs "simonandgarfunkel" 0.88, "toto" vs "tool" 0.87, "wham" vs "ham" 0.92.

**Ruled out: trigram similarity for the check.** I emulated `pg_trgm.similarity` in JS: trigrams per word with two leading spaces and one trailing space, intersection divided by union. It is too coarse for short single-word names: "beyonse" scores 0.45, "shakria" 0.33, "anuk" 0.38, "aha" vs "a-ha" 0.29. Meanwhile "andre hazes jr" scores 0.80, so no single cut-off separates the matches from the near-misses.

## 5. Postgres options (when they would matter)

All three extensions are available in Supabase and can be switched on under Database → Extensions ([Supabase extensions](https://supabase.com/docs/guides/database/extensions)):

- **`pg_trgm`.** `similarity`, `word_similarity` and `strict_word_similarity`, with default thresholds of 0.3, 0.6 and 0.5. It ignores non-alphanumeric characters and is case-insensitive in a default build ([PostgreSQL: pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html)). With a GIN/GiST index it is the right tool **if we later add an artist search or autocomplete**, but it is not suited to the yes/no check (§4).
- **`fuzzystrmatch`.** `levenshtein` and `levenshtein_less_equal` cap their inputs at 255 characters. The docs warn that `soundex`, `metaphone` and `dmetaphone` "do not work well with multibyte encodings (such as UTF-8)" and say to use `daitch_mokotoff` or `levenshtein` instead ([PostgreSQL: fuzzystrmatch](https://www.postgresql.org/docs/current/fuzzystrmatch.html)). Phonetic codes therefore don't fit Dutch names with diacritics.
- **`unaccent`.** A dictionary that removes accents. It is only relevant if matching ever moves into SQL.

Keeping the check in TS gives instant feedback without a round trip, needs no extensions, and is easy to unit-test.

## 6. JS/TS libraries considered

| Package | Version | Notes |
|---|---|---|
| `fastest-levenshtein` | 1.0.16, MIT | Fast plain Levenshtein. No transpositions. Fallback choice. |
| `fuse.js` | 7.5.0, Apache-2.0 | Fuzzy *search* over lists (Bitap). Defaults: `threshold: 0.6`, `ignoreDiacritics: false` (read from `dist/fuse.mjs`). It ranks results but gives no clean yes/no score, so it is more than this needs. |
| `@skyra/jaro-winkler` | 1.1.1, MIT | Prefix bias, rejected (§4). |
| `string-similarity` | 4.0.4 | **Deprecated** on npm ("Package no longer supported"). |
| `damerau-levenshtein`, `talisman` | last published 2022 | Would work, but the OSA function is small enough to own. |

## 7. Sketch

```ts
const FOLD: Record<string, string> = { ø: 'o', æ: 'ae', œ: 'oe', ß: 'ss', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };
export function normaliseArtist(s: string): string {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[øæœßłđðþı]/g, c => FOLD[c])
    .replace(/\s*[&+]\s*/g, ' and ').replace(/\ben\b/g, 'and')
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/^(the|de|het) /, '');
}
function osa(a: string, b: string): number { /* standard optimal-string-alignment DP, ~12 lines */ }
const sim = (a: string, b: string) => {
  const x = a.replace(/ /g, ''), y = b.replace(/ /g, '');
  const m = Math.max(x.length, y.length);
  return m === 0 ? 1 : 1 - osa(x, y) / m;
};
const SPLIT = /\s*(?:,|;|\/|\bfeat\b\.?|\bft\b\.?|\bfeaturing\b|\bwith\b|\bmet\b|\bvs\b\.?|\bx\b|\band\b)\s*/;
export const ARTIST_THRESHOLD = 0.8;
export function artistMatches(guess: string, artists: string[], aliases: string[] = []): boolean {
  const g = normaliseArtist(guess);
  const parts = [g, ...g.split(SPLIT).filter(Boolean)];
  const cands = [artists.join(', '), ...artists, ...aliases].map(normaliseArtist);
  return parts.some(p => cands.some(c => sim(p, c) >= ARTIST_THRESHOLD));
}
```

Open points for the build tickets: whether a wrong extra artist should fail (§2), whether surnames count (§3, aliases), and the Jr./Sr. edge case (§4).
