import { describe, expect, it, vi } from "vitest";
import { lookupArtistKind } from "./musicbrainz";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("lookupArtistKind", () => {
  it("retries when MusicBrainz is busy", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { artists: [{ name: "Queen", type: "Group", score: 100 }] }));
    await expect(lookupArtistKind("Queen", { fetchFn, retryDelayMs: 1 })).resolves.toBe("group");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("keeps the kind unknown when the top hit has another name", async () => {
    const fetchFn = async () => json(200, { artists: [{ name: "Queens", type: "Group", score: 100 }] });
    await expect(lookupArtistKind("Queen", { fetchFn })).resolves.toBeNull();
  });
});
