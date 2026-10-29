import type { JoinedCard } from "./join";
import type { SpotifyTrack } from "./spotify";

// What a previous run stored about a track, rebuilt into the shape fetchTrack returns.
export type StoredTrack = { checkedAt: string | null; track: SpotifyTrack };

// Spotify allows a development-mode app only a small burst of calls; going over locks it out for a day.
// So a run reuses what an earlier run stored, and only looks up tracks that are new or older than this.
export const SPOTIFY_RECHECK_DAYS = 30;

export function splitByFreshness(
  cards: JoinedCard[],
  stored: Map<string, StoredTrack>,
  { now = new Date(), maxAgeDays = SPOTIFY_RECHECK_DAYS, recheck = false } = {},
): { reused: Map<string, SpotifyTrack>; toLookUp: string[] } {
  const reused = new Map<string, SpotifyTrack>();
  const toLookUp = new Set<string>();
  const oldest = now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000;

  for (const { spotifyTrackId: id } of cards) {
    const hit = stored.get(id);
    // A song without credited artists was not found last time, so it is looked up again.
    const fresh = hit?.checkedAt && Date.parse(hit.checkedAt) >= oldest && hit.track.artists.length > 0;
    if (!recheck && fresh) reused.set(id, hit.track);
    else toLookUp.add(id);
  }
  return { reused, toLookUp: [...toLookUp] };
}
