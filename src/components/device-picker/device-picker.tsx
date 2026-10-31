"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BROWSER_TARGET,
  deviceIcon,
  devicesFrom,
  hasScreen,
  sameTarget,
  targetFor,
  type DeviceIcon as DeviceIconName,
  type PlaybackTarget,
  type SpotifyDevice,
} from "@/lib/playback/devices";
import { spotifyCall } from "@/lib/playback/spotify-web-api";
import styles from "./device-picker.module.css";

const paths: Record<DeviceIconName | "apparaten", ReactNode> = {
  telefoon: (
    <>
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </>
  ),
  computer: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="5" width="19" height="13" rx="1.5" />
      <path d="M8 21h8" />
    </>
  ),
  speaker: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2" />
      <circle cx="12" cy="14.5" r="3.2" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
    </>
  ),
  // Like Spotify's own device button: a screen next to a speaker.
  apparaten: (
    <>
      <path d="M9 4H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H9M5 19h4" />
      <rect x="12" y="3" width="9.5" height="17" rx="1.5" />
      <circle cx="16.75" cy="13.5" r="2.6" />
      <circle cx="16.75" cy="7" r=".9" fill="currentColor" />
    </>
  ),
};

export function DeviceIcon({ name, className }: { name: DeviceIconName | "apparaten"; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function targetIcon(target: PlaybackTarget): DeviceIconName {
  return target.kind === "browser" ? "telefoon" : deviceIcon(target.type);
}

type Load = { status: "laden" } | { status: "klaar"; devices: SpotifyDevice[] } | { status: "fout"; message: string };

type SheetProps = {
  open: boolean;
  target: PlaybackTarget;
  onChoose: (target: PlaybackTarget) => void;
  onClose: () => void;
};

// "Afspelen op": this browser first, then the Spotify devices that are awake right now.
// Asks Spotify for the list once per opening, and again only on "Ververs".
export function DevicePickerSheet({ open, target, onChoose, onClose }: SheetProps) {
  const [load, setLoad] = useState<Load>({ status: "laden" });
  const sheetRef = useRef<HTMLDivElement>(null);

  const fetchDevices = useCallback(async () => {
    setLoad({ status: "laden" });
    try {
      const response = await spotifyCall("/me/player/devices");
      if (response.status === 429) {
        setLoad({ status: "fout", message: "Spotify blokkeert de app even. Probeer het later opnieuw." });
        return;
      }
      if (!response.ok) {
        setLoad({ status: "fout", message: "De apparaten konden niet geladen worden." });
        return;
      }
      setLoad({ status: "klaar", devices: devicesFrom(await response.json()) });
    } catch {
      setLoad({ status: "fout", message: "Geen verbinding met Spotify." });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Loading is the point of opening the sheet: one Spotify call, through the shared queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchDevices();
    sheetRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, fetchDevices, onClose]);

  if (!open) return null;

  const choose = (next: PlaybackTarget) => {
    onChoose(next);
    onClose();
  };

  return (
    <div className={styles.layer}>
      <div className={styles.scrim} onClick={onClose} />
      <div
        ref={sheetRef}
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby="afspelen-op-titel"
        tabIndex={-1}
      >
        <div className={styles.grip} aria-hidden="true" />
        <div className={styles.head}>
          <h2 id="afspelen-op-titel" className={styles.title}>
            Afspelen op
          </h2>
          <button
            type="button"
            className={styles.refresh}
            onClick={() => void fetchDevices()}
            disabled={load.status === "laden"}
          >
            ↻ Ververs
          </button>
        </div>
        <ul className={styles.list}>
          <li>
            <DeviceRow
              icon="telefoon"
              name="Deze telefoon"
              sub="Jaartal in de browser"
              selected={target.kind === "browser"}
              onClick={() => choose(BROWSER_TARGET)}
            />
          </li>
          {load.status === "klaar"
            ? load.devices.map((device) => {
                const next = targetFor(device);
                const screen = hasScreen(device.type);
                return (
                  <li key={device.id}>
                    <DeviceRow
                      icon={deviceIcon(device.type)}
                      name={device.name}
                      sub={
                        device.restricted
                          ? "Spotify laat de app dit apparaat niet bedienen"
                          : screen
                            ? "Toont titel en hoes van het nummer"
                            : "Spotify Connect"
                      }
                      warn={screen && !device.restricted}
                      disabled={device.restricted}
                      selected={sameTarget(target, next)}
                      onClick={() => choose(next)}
                    />
                  </li>
                );
              })
            : null}
        </ul>
        {load.status === "laden" ? <p className={styles.note}>Apparaten zoeken…</p> : null}
        {load.status === "fout" ? (
          <p className={styles.problem} role="alert">
            {load.message}
          </p>
        ) : null}
        <p className={styles.note}>Staat je apparaat er niet bij? Open Spotify erop, dan verschijnt het hier.</p>
      </div>
    </div>
  );
}

type RowProps = {
  icon: DeviceIconName;
  name: string;
  sub: string;
  selected: boolean;
  warn?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function DeviceRow({ icon, name, sub, selected, warn, disabled, onClick }: RowProps) {
  return (
    <button
      type="button"
      className={`${styles.device} ${selected ? styles.selected : ""}`}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className={styles.icon}>
        <DeviceIcon name={icon} />
      </span>
      <span className={styles.text}>
        <span className={styles.name}>{name}</span>
        <span className={warn ? styles.warn : styles.sub}>
          {warn ? "⚠ " : ""}
          {sub}
        </span>
      </span>
      <span className={styles.check} aria-hidden="true">
        {selected ? "✓" : ""}
      </span>
    </button>
  );
}
