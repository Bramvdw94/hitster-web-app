"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecordPlayer } from "@/components/record-player/record-player";
import { TimelineLadder, type LadderCard } from "@/components/timeline-ladder/timeline-ladder";
import { YearCorrection } from "@/components/year-correction/year-correction";
import { WINNING_CARDS, type TimelineCard } from "@/lib/game/state";
import { usePlayback } from "@/lib/playback/use-playback";
import { placeSoloCard, type PlacementReveal } from "../actions";
import shared from "../../oefenen/oefenen.module.css";
import styles from "../spel.module.css";

type Props = {
  gameId: string;
  placed: number;
  timeline: TimelineCard[];
  trackId: string;
  // Bram sees "Jaar klopt niet" on the reveal.
  canCorrectYears: boolean;
};

const problemText = {
  verouderd: "Dit nummer was al geplaatst. Je gaat verder bij het volgende.",
  mislukt: "Je plaatsing kwam niet aan. Probeer het nog eens.",
} as const;

const toLadder = (cards: TimelineCard[]): LadderCard[] => cards.map((c) => ({ key: c.songId, ...c }));

// The timeline with the revealed card where it was put: green when right, red when wrong.
function revealLadder(reveal: PlacementReveal): LadderCard[] {
  const placedCard: LadderCard = {
    key: reveal.songId,
    year: reveal.cardYear,
    title: reveal.title,
    artist: reveal.artist,
    mark: reveal.correct ? "good" : "wrong",
  };
  const cards = toLadder(reveal.timeline);
  return [...cards.slice(0, reveal.gap), placedCard, ...cards.slice(reveal.gap)];
}

// The timeline the next turn starts from: a right card stays, a wrong one is discarded.
function timelineAfter(reveal: PlacementReveal): TimelineCard[] {
  if (!reveal.correct) return reveal.timeline;
  const card = { songId: reveal.songId, year: reveal.cardYear, title: reveal.title, artist: reveal.artist };
  return [...reveal.timeline.slice(0, reveal.gap), card, ...reveal.timeline.slice(reveal.gap)];
}

// One turn after another: listen, tap a gap in the timeline, place, then the sleeve reveal.
// The server checks every placement; this only shows what it sends back.
export function SoloTurn(props: Props) {
  const router = useRouter();
  const playback = usePlayback();
  const [placed, setPlaced] = useState(props.placed);
  const [timeline, setTimeline] = useState(props.timeline);
  const [trackId, setTrackId] = useState(props.trackId);
  const [started, setStarted] = useState(false);
  const [gap, setGap] = useState<number | null>(null);
  const [reveal, setReveal] = useState<PlacementReveal | null>(null);
  const [problem, setProblem] = useState<keyof typeof problemText | null>(null);
  const [pending, startTransition] = useTransition();

  function startSong() {
    playback.play(trackId);
    setStarted(true);
  }

  function place() {
    if (gap === null) return;
    setProblem(null);
    startTransition(async () => {
      const result = await placeSoloCard(props.gameId, placed, gap);
      if (result.ok) {
        setReveal(result.reveal);
        return;
      }
      setProblem(result.problem);
      // Another tab or a double tap got there first: reload the game where it really is.
      if (result.problem === "verouderd") router.refresh();
    });
  }

  function next() {
    if (!reveal) return;
    if (reveal.nextTrackId === null) {
      playback.pause();
      router.refresh();
      return;
    }
    // Inside the tap, so the phone lets the next song play right away.
    playback.play(reveal.nextTrackId);
    setTimeline(timelineAfter(reveal));
    setPlaced(reveal.placed);
    setTrackId(reveal.nextTrackId);
    setStarted(true);
    setGap(null);
    setReveal(null);
  }

  if (reveal) {
    const cards = timelineAfter(reveal).length;
    return (
      <>
        <p className={shared.status}>
          <span>
            Nummer <b>{reveal.placed}</b>
          </span>
          <span>
            <b>{cards}</b> van {WINNING_CARDS} kaarten
          </span>
        </p>
        <p className={`${styles.verdict} ${reveal.correct ? shared.good : shared.wrong}`}>
          {reveal.correct ? "Goed geplaatst" : "Verkeerde plek"}
        </p>

        <section className={shared.sleeve} aria-label="Het nummer">
          {reveal.coverUrl ? (
            // Spotify's own cover, shown as ADR 0001 requires.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={shared.cover} src={reveal.coverUrl} alt="" width={96} height={96} />
          ) : (
            <span className={shared.cover} aria-hidden="true" />
          )}
          <div className={shared.sleeveText}>
            <p className={shared.sleeveYear}>{reveal.cardYear}</p>
            {reveal.uncertainYear ? <p className={shared.uncertain}>jaar onzeker</p> : null}
            <p className={shared.sleeveTitle}>{reveal.title}</p>
            <p className={shared.sleeveArtist}>{reveal.artist}</p>
            {props.canCorrectYears ? (
              <YearCorrection key={reveal.songId} songId={reveal.songId} cardYear={reveal.cardYear} />
            ) : null}
          </div>
        </section>

        {reveal.outcome === "won" ? (
          <p className={styles.record}>
            10 kaarten in {reveal.songsNeeded} nummers
            {reveal.newRecord && reveal.personalBest !== null ? " · Nieuw record!" : null}
          </p>
        ) : null}
        {reveal.outcome === "deck_empty" ? (
          <p className={shared.hint}>De stapel is op. Dit spel krijgt geen score.</p>
        ) : null}

        <TimelineLadder cards={revealLadder(reveal)} />

        <button type="button" className={shared.cta} onClick={next}>
          {reveal.nextTrackId === null ? "Naar de uitslag" : "Volgend nummer"}
        </button>
      </>
    );
  }

  return (
    <>
      <p className={shared.status}>
        <span>
          Nummer <b>{placed + 1}</b>
        </span>
        <span>
          <b>{timeline.length}</b> van {WINNING_CARDS} kaarten
        </span>
      </p>
      <RecordPlayer playback={playback} />

      <section aria-label="Jouw tijdlijn">
        <h2 className={shared.section}>Jouw tijdlijn</h2>
        <TimelineLadder cards={toLadder(timeline)} selected={gap} onSelect={setGap} disabled={pending} />
      </section>

      {problem ? (
        <p className={shared.problem} role="alert">
          {problemText[problem]}
        </p>
      ) : null}

      {started ? (
        <button type="button" className={shared.cta} onClick={place} disabled={gap === null || pending}>
          {gap === null ? "Tik op een plek" : "Plaatsen"}
        </button>
      ) : (
        <button
          type="button"
          className={shared.cta}
          onClick={startSong}
          disabled={playback.state.status === "verbinden"}
        >
          {playback.state.status === "verbinden" ? "Speler verbinden…" : "Zet de plaat op"}
        </button>
      )}
    </>
  );
}
