import { describe, expect, it, vi } from "vitest";
import { baseTitle, lookupArtistKind, lookupFirstReleaseYear } from "./musicbrainz";

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

describe("lookupFirstReleaseYear", () => {
  it("takes the earliest first release of a recording with the same title", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      json(200, {
        recordings: [
          { title: "Let It Be", score: 100, "first-release-date": "2009-09-09" },
          { title: "Let It Be", score: 98, "first-release-date": "1970-03-06" },
          { title: "Let It Be Me", score: 95, "first-release-date": "1960-01-01" },
          { title: "Let It Be", score: 40, "first-release-date": "1950" },
        ],
      }),
    );
    await expect(lookupFirstReleaseYear("The Beatles", "Let It Be - Remastered 2009", { fetchFn })).resolves.toBe(1970);
    expect(String(fetchFn.mock.calls[0][0])).toContain(encodeURIComponent('recording:"Let It Be"'));
  });

  it("gives no year when nothing matches", async () => {
    const fetchFn = async () => json(200, { recordings: [{ title: "Other", score: 100, "first-release-date": "1980" }] });
    await expect(lookupFirstReleaseYear("X", "Song", { fetchFn })).resolves.toBeNull();
  });

  it("strips version notes from a title", () => {
    expect(baseTitle("Mi Gente - Original Mix")).toBe("Mi Gente");
    expect(baseTitle("Walk This Way (feat. Aerosmith)")).toBe("Walk This Way");
    expect(baseTitle("(I Can't Get No) Satisfaction")).toBe("(I Can't Get No) Satisfaction");
  });
});
