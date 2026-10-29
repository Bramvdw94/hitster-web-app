import { describe, expect, it } from "vitest";
import { classifyLoginError, isLoginError } from "./login-error";

describe("classifyLoginError", () => {
  it("sends a player missing from the Spotify allowlist to Bram", () => {
    expect(
      classifyLoginError("server_error", "Error getting user profile from external provider"),
    ).toBe("gastenlijst");
  });

  it("recognises Spotify's own wording too", () => {
    expect(classifyLoginError("server_error", "User not registered in the Developer Dashboard")).toBe(
      "gastenlijst",
    );
  });

  it("treats a cancelled consent screen as cancelled", () => {
    expect(classifyLoginError("access_denied", "The user denied the request")).toBe("afgebroken");
  });

  it("falls back to a generic message", () => {
    expect(classifyLoginError(null, null)).toBe("onbekend");
    expect(classifyLoginError("invalid_request", "bad state")).toBe("onbekend");
  });
});

describe("isLoginError", () => {
  it("accepts only known codes", () => {
    expect(isLoginError("gastenlijst")).toBe(true);
    expect(isLoginError("toString")).toBe(false);
    expect(isLoginError(undefined)).toBe(false);
  });
});
