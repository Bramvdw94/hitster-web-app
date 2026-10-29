import { describe, expect, it, vi } from "vitest";
import { fetchTrack } from "./spotify";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

const track = {
  is_playable: true,
  album: { images: [{ url: "small", width: 64 }, { url: "large", width: 640 }] },
  artists: [{ id: "a1", name: "Queen" }, { id: null, name: "Local file" }],
};

describe("fetchTrack", () => {
  it("asks for the NL market and keeps the largest cover", async () => {
    const fetchFn = vi.fn(async () => json(200, track));
    const result = await fetchTrack("2222222222222222222222", "token", { fetchFn });

    expect(fetchFn).toHaveBeenCalledWith(
      "https://api.spotify.com/v1/tracks/2222222222222222222222?market=NL",
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    );
    expect(result).toEqual({ coverUrl: "large", artists: [{ id: "a1", name: "Queen" }], playableNl: true });
  });

  it("retries after a 429", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { "retry-after": "0.01" }))
      .mockResolvedValueOnce(json(200, { ...track, is_playable: false }));
    const result = await fetchTrack("x", "token", { fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result?.playableNl).toBe(false);
  });

  it("stops on a long rate limit instead of sleeping through it", async () => {
    const fetchFn = async () => json(429, {}, { "retry-after": "3600" });
    await expect(fetchTrack("x", "t", { fetchFn })).rejects.toThrow("retry after 60 minutes");
  });

  it("retries when a request hangs or fails", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(json(200, track));
    vi.useFakeTimers();
    const result = fetchTrack("x", "t", { fetchFn });
    await vi.runAllTimersAsync();
    vi.useRealTimers();
    expect((await result)?.playableNl).toBe(true);
  });

  it("returns null for an unknown track and throws on other errors", async () => {
    await expect(fetchTrack("x", "t", { fetchFn: async () => json(404, {}) })).resolves.toBeNull();
    await expect(fetchTrack("x", "t", { fetchFn: async () => json(403, { error: "nope" }) })).rejects.toThrow("403");
  });
});
