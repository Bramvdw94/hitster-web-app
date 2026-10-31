// Spotify Connect devices: where the record player's song can play besides this browser.
// Pure, so it can be tested without Spotify.

// Shown in the Spotify app's device list, so it must say nothing about the song.
export const BROWSER_DEVICE_NAME = "Jaartal";

export type DeviceTarget = { kind: "device"; id: string; name: string; type: string };
export type PlaybackTarget = { kind: "browser" } | DeviceTarget;

export const BROWSER_TARGET: PlaybackTarget = { kind: "browser" };

export type SpotifyDevice = {
  id: string;
  name: string;
  type: string;
  active: boolean;
  // Spotify refuses Web API commands for restricted devices.
  restricted: boolean;
};

type RawDevice = {
  id?: string | null;
  name?: string;
  type?: string;
  is_active?: boolean;
  is_restricted?: boolean;
};

function toDevice(raw: RawDevice): SpotifyDevice | null {
  if (!raw.id || !raw.name) return null;
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type ?? "Unknown",
    active: raw.is_active === true,
    restricted: raw.is_restricted === true,
  };
}

// The body of GET /me/player/devices, without Jaartal's own browser players (this tab or another).
export function devicesFrom(body: unknown): SpotifyDevice[] {
  const list = (body as { devices?: RawDevice[] } | null)?.devices ?? [];
  return list
    .map(toDevice)
    .filter((device): device is SpotifyDevice => device !== null && device.name !== BROWSER_DEVICE_NAME);
}

// Device types whose screen shows the title and cover of what plays.
const SCREEN_TYPES = new Set([
  "computer",
  "tablet",
  "smartphone",
  "tv",
  "gameconsole",
  "castvideo",
  "stb",
  "automobile",
]);

export function hasScreen(type: string): boolean {
  return SCREEN_TYPES.has(type.toLowerCase());
}

export type DeviceIcon = "telefoon" | "computer" | "tv" | "speaker";

export function deviceIcon(type: string): DeviceIcon {
  switch (type.toLowerCase()) {
    case "smartphone":
    case "tablet":
      return "telefoon";
    case "computer":
      return "computer";
    case "tv":
    case "castvideo":
    case "stb":
    case "gameconsole":
      return "tv";
    default:
      return "speaker";
  }
}

export function targetFor(device: SpotifyDevice): DeviceTarget {
  return { kind: "device", id: device.id, name: device.name, type: device.type };
}

export function sameTarget(a: PlaybackTarget, b: PlaybackTarget): boolean {
  if (a.kind === "browser" || b.kind === "browser") return a.kind === b.kind;
  return a.id === b.id;
}

// The device in GET /me/player (204 means no body, so null), when it is one we may offer.
export function playingDeviceFrom(body: unknown): SpotifyDevice | null {
  const state = body as { device?: RawDevice; is_playing?: boolean } | null;
  if (!state?.device || state.is_playing !== true) return null;
  const device = toDevice(state.device);
  if (!device || device.restricted || device.name === BROWSER_DEVICE_NAME) return null;
  return device;
}

// The stored choice, read back from localStorage. Anything odd means this browser.
export function parseTarget(stored: string | null): PlaybackTarget {
  if (!stored) return BROWSER_TARGET;
  try {
    const value = JSON.parse(stored) as Partial<DeviceTarget> | null;
    if (value?.kind === "device" && typeof value.id === "string" && typeof value.name === "string") {
      return { kind: "device", id: value.id, name: value.name, type: typeof value.type === "string" ? value.type : "Unknown" };
    }
  } catch {
    // An old or broken value: play here.
  }
  return BROWSER_TARGET;
}
