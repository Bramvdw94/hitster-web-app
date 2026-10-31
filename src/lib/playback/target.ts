"use client";

import { useSyncExternalStore } from "react";
import { BROWSER_TARGET, parseTarget, type PlaybackTarget } from "./devices";

// Where songs play, remembered in this browser for the next turns, games and rounds.
const STORAGE_KEY = "jaartal-afspelen-op";

let current: PlaybackTarget | null = null;
const listeners = new Set<() => void>();

export function getPlaybackTarget(): PlaybackTarget {
  if (current) return current;
  try {
    current = parseTarget(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    current = BROWSER_TARGET;
  }
  return current;
}

export function setPlaybackTarget(target: PlaybackTarget) {
  current = target;
  try {
    if (target.kind === "browser") window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(target));
  } catch {
    // Private mode: the choice lasts until the page closes.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePlaybackTarget(): PlaybackTarget {
  return useSyncExternalStore(subscribe, getPlaybackTarget, () => BROWSER_TARGET);
}
