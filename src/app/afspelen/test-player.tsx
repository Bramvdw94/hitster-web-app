"use client";

import { useEffect, useState } from "react";
import { RecordPlayer } from "@/components/record-player/record-player";
import { usePlayback } from "@/lib/playback/use-playback";
import { pickRandomTrack } from "./actions";
import styles from "./page.module.css";

// The temporary playback test: "Speel een nummer" plays a random song from the catalogue.
export function TestPlayer() {
  const playback = usePlayback();
  // Picked ahead, so the tap can start the song at once (phones only allow sound inside a tap).
  const [nextTrackId, setNextTrackId] = useState<string | null>(null);
  const [catalogueProblem, setCatalogueProblem] = useState(false);

  function pickNext() {
    pickRandomTrack()
      .then((trackId) => {
        setNextTrackId(trackId);
        setCatalogueProblem(trackId === null);
      })
      .catch(() => setCatalogueProblem(true));
  }

  useEffect(pickNext, []);

  const { status } = playback.state;
  const canPlay = nextTrackId !== null && status !== "verbinden" && status !== "fout";

  function playSong() {
    if (!nextTrackId) return;
    playback.play(nextTrackId);
    setNextTrackId(null);
    pickNext();
  }

  return (
    <>
      <RecordPlayer playback={playback} />
      <button type="button" className={styles.cta} onClick={playSong} disabled={!canPlay}>
        {status === "speelt" || status === "pauze" ? "Volgend nummer" : "Speel een nummer"}
      </button>
      {catalogueProblem ? <p className={styles.note}>Er zijn geen nummers gevonden in de catalogus.</p> : null}
    </>
  );
}
