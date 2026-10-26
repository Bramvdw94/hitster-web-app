# Accept Spotify's "no games" policy risk for a private practice app

Spotify's Developer Policy forbids games and quizzes built on Spotify content (III.2) and requires showing cover art and song info during playback (II.5). A Hitster practice app breaks both by design. Bram accepted this risk on 2026-10-26 because full-track playback through his own Premium account is what makes the app feel like the real game. The realistic worst case is that Spotify revokes the app's client ID and playback stops, with no consequences for Bram's own Spotify account.

## Consequences

- The app stays private and non-commercial, in Spotify development mode (at most 5 allowlisted users). There is no public launch and no monetisation.
- The answer screen always shows the cover art, title and artist of the song that just played.
- If the client ID is ever revoked, the fallback is a different audio source, not a policy appeal.
