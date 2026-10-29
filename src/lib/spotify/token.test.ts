import { describe, expect, it, vi } from "vitest";
import {
  REFRESH_MARGIN_MS,
  SpotifyLoginExpiredError,
  expiryFrom,
  needsRefresh,
  refreshAccessToken,
} from "./token";

const now = new Date("2026-10-29T20:00:00Z");
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
const credentials = { clientId: "id", clientSecret: "secret" };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("needsRefresh", () => {
  it("keeps a token with plenty of time left", () => {
    expect(needsRefresh(minutes(30), now)).toBe(false);
  });

  it("keeps a token just outside the margin", () => {
    expect(needsRefresh(new Date(now.getTime() + REFRESH_MARGIN_MS + 1), now)).toBe(false);
  });

  it("refreshes a token right at the margin", () => {
    expect(needsRefresh(new Date(now.getTime() + REFRESH_MARGIN_MS), now)).toBe(true);
  });

  it("refreshes a token about to expire", () => {
    expect(needsRefresh(minutes(2), now)).toBe(true);
  });

  it("refreshes a token that already expired, e.g. after more than an hour", () => {
    expect(needsRefresh(minutes(-61), now)).toBe(true);
  });
});

describe("expiryFrom", () => {
  it("adds the lifetime in seconds", () => {
    expect(expiryFrom(now, 3600)).toEqual(minutes(60));
  });
});

describe("refreshAccessToken", () => {
  it("posts the refresh token with basic auth and returns the new token", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { access_token: "new", expires_in: 3600, token_type: "Bearer" }),
    );

    const result = await refreshAccessToken("old-refresh", credentials, now, fetchFn);

    expect(result).toEqual({ accessToken: "new", expiresAt: minutes(60), refreshToken: null });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://accounts.spotify.com/api/token");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("id:secret").toString("base64")}`,
    );
    expect(String(init?.body)).toBe("grant_type=refresh_token&refresh_token=old-refresh");
  });

  it("passes on a rotated refresh token", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(200, { access_token: "new", expires_in: 3600, refresh_token: "rotated" }),
    );

    const result = await refreshAccessToken("old-refresh", credentials, now, fetchFn);

    expect(result.refreshToken).toBe("rotated");
  });

  it("asks for a new login when Spotify revoked the refresh token", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse(400, { error: "invalid_grant", error_description: "Refresh token revoked" }),
    );

    await expect(refreshAccessToken("old-refresh", credentials, now, fetchFn)).rejects.toBeInstanceOf(
      SpotifyLoginExpiredError,
    );
  });

  it("fails loudly on any other error", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(503, {}));

    await expect(refreshAccessToken("old-refresh", credentials, now, fetchFn)).rejects.toThrow(
      "Spotify token refresh failed (503)",
    );
  });
});
