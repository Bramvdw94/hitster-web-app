import { describe, expect, it } from "vitest";
import { readSupabaseEnv } from "./env";

describe("readSupabaseEnv", () => {
  it("returns the URL and publishable key", () => {
    expect(readSupabaseEnv("https://example.supabase.co", "sb_publishable_x")).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_x",
    });
  });

  it("names every missing variable", () => {
    expect(() => readSupabaseEnv("", "")).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("names only the missing key", () => {
    expect(() => readSupabaseEnv("https://example.supabase.co", undefined)).toThrow(
      /: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY$/,
    );
  });
});
