import { describe, expect, it } from "vitest";
import {
  BROWSER_TARGET,
  deviceIcon,
  devicesFrom,
  hasScreen,
  parseTarget,
  playingDeviceFrom,
  sameTarget,
} from "./devices";

const raw = (name: string, extra: Record<string, unknown> = {}) => ({
  id: `id-${name}`,
  name,
  type: "Speaker",
  is_active: false,
  is_restricted: false,
  ...extra,
});

describe("devicesFrom", () => {
  it("lists Spotify's devices without Jaartal's own browser players", () => {
    const devices = devicesFrom({ devices: [raw("Woonkamer"), raw("Jaartal", { type: "Computer" }), raw("MacBook", { type: "Computer" })] });
    expect(devices.map((d) => d.name)).toEqual(["Woonkamer", "MacBook"]);
  });

  it("skips devices without an id, which Spotify cannot be told to play on", () => {
    expect(devicesFrom({ devices: [raw("Woonkamer", { id: null })] })).toEqual([]);
  });

  it("keeps restricted devices so they can show why they cannot be picked", () => {
    expect(devicesFrom({ devices: [raw("Auto", { is_restricted: true })] })[0].restricted).toBe(true);
  });

  it("copes with an empty or odd body", () => {
    expect(devicesFrom(null)).toEqual([]);
    expect(devicesFrom({})).toEqual([]);
  });
});

describe("hasScreen", () => {
  it("warns for devices that show the title and cover", () => {
    expect(hasScreen("Computer")).toBe(true);
    expect(hasScreen("TV")).toBe(true);
    expect(hasScreen("Smartphone")).toBe(true);
  });

  it("does not warn for speakers", () => {
    expect(hasScreen("Speaker")).toBe(false);
    expect(hasScreen("CastAudio")).toBe(false);
  });
});

describe("deviceIcon", () => {
  it("picks an icon per kind of device", () => {
    expect(deviceIcon("Smartphone")).toBe("telefoon");
    expect(deviceIcon("Computer")).toBe("computer");
    expect(deviceIcon("TV")).toBe("tv");
    expect(deviceIcon("AVR")).toBe("speaker");
  });
});

describe("playingDeviceFrom", () => {
  it("offers the device Spotify plays on", () => {
    expect(playingDeviceFrom({ is_playing: true, device: raw("Woonkamer", { is_active: true }) })?.name).toBe("Woonkamer");
  });

  it("offers nothing when paused, restricted or Jaartal itself", () => {
    expect(playingDeviceFrom({ is_playing: false, device: raw("Woonkamer") })).toBeNull();
    expect(playingDeviceFrom({ is_playing: true, device: raw("Auto", { is_restricted: true }) })).toBeNull();
    expect(playingDeviceFrom({ is_playing: true, device: raw("Jaartal") })).toBeNull();
    expect(playingDeviceFrom(null)).toBeNull();
  });
});

describe("parseTarget", () => {
  it("reads back a stored device", () => {
    const stored = JSON.stringify({ kind: "device", id: "abc", name: "Woonkamer", type: "Speaker" });
    expect(parseTarget(stored)).toEqual({ kind: "device", id: "abc", name: "Woonkamer", type: "Speaker" });
  });

  it("falls back to this browser for nothing or rubbish", () => {
    expect(parseTarget(null)).toEqual(BROWSER_TARGET);
    expect(parseTarget("{oops")).toEqual(BROWSER_TARGET);
    expect(parseTarget(JSON.stringify({ kind: "device" }))).toEqual(BROWSER_TARGET);
  });
});

describe("sameTarget", () => {
  it("compares devices by id", () => {
    const a = { kind: "device", id: "1", name: "A", type: "Speaker" } as const;
    expect(sameTarget(a, { ...a, name: "renamed" })).toBe(true);
    expect(sameTarget(a, BROWSER_TARGET)).toBe(false);
    expect(sameTarget(BROWSER_TARGET, BROWSER_TARGET)).toBe(true);
  });
});
