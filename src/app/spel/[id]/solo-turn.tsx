"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecordPlayer } from "@/components/record-player/record-player";
import { TimelineLadder, type LadderCard } from "@/components/timeline-ladder/timeline-ladder";
import { YearCorrection } from "@/components/year-correction/year-correction";
import { DEFAULT_YEAR } from "@/components/year-ruler/ruler";
import { YearRuler } from "@/components/year-ruler/year-ruler";
import { BUY_COST, MAX_TOKENS, SKIP_COST, WINNING_CARDS, type TimelineCard, type Variant } from "@/lib/game/state";
import { usePlayback } from "@/lib/playback/use-playback";
import { buySoloCard, placeSoloCard, skipSoloSong, type PlacementReveal, type PlacementResult } from "../actions";
import shared from "../../oefenen/oefenen.module.css";
import styles from "../spel.module.css";

type Props = {
  gameId: string;
  variant: Variant;
  placed: number;
  tokens: number;
  timeline: TimelineCard[];
  trackId: string;
  // Bram sees "Jaar klopt niet" on the reveal.
  canCorrectYears: boolean;
};

const problemText = {
  verouderd: "Dit nummer was al gespeeld. Je gaat verder bij het volgende.",
  mislukt: "Je zet kwam niet aan. Probeer het nog eens.",
} as const;

const toLadder = (cards: TimelineCard[]): LadderCard[] => cards.map((c) => ({ key: c.songId, ...c }));

// The timeline with the revealed card where it was put: green when won, red when discarded.
// A skipped song never touches the timeline.
function revealLadder(reveal: PlacementReveal): LadderCard[] {
  const cards = toLadder(reveal.timeline);
  if (reveal.kind === "skipped") return cards;
  const placedCard: LadderCard = {
    key: reveal.songId,
    year: reveal.cardYear,
    title: reveal.title,
    artist: reveal.artist,
    mark: reveal.won ? "good" : "wrong",
  };
  return [...cards.slice(0, reveal.gap), placedCard, ...cards.slice(reveal.gap)];
}

// The timeline the next turn starts from: a won card stays, anything else is gone.
function timelineAfter(reveal: PlacementReveal): TimelineCard[] {
  if (!reveal.won) return reveal.timeline;
  const card = { songId: reveal.songId, year: reveal.cardYear, title: reveal.title, artist: reveal.artist };
  return [...reveal.timeline.slice(0, reveal.gap), card, ...reveal.timeline.slice(reveal.gap)];
}

function verdictOf(reveal: PlacementReveal): string {
  if (reveal.kind === "skipped") return "Overgeslagen";
  if (reveal.kind === "bought") return "Gekocht";
  if (reveal.variant === "original") return reveal.correct ? "Goed geplaatst" : "Verkeerde plek";
  if (reveal.won) return "Kaart gewonnen";
  return reveal.correct ? "Kaart weg" : "Verkeerde plek";
}

function yearText(guessed: number, cardYear: number): string {
  const off = Math.abs(guessed - cardYear);
  return off === 0 ? "Precies" : `${off} jaar ernaast`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// Small counters above the timeline: one coin per token, out of the five you can hold.
function Tokens({ count }: { count: number }) {
  return (
    <p className={styles.tokens} aria-label={`${count} van ${MAX_TOKENS} tokens`}>
      <span className={styles.tokensLabel}>Tokens</span>
      {Array.from({ length: MAX_TOKENS }, (_, i) => (
        <span key={i} className={`${styles.token} ${i < count ? styles.tokenOn : ""}`} aria-hidden="true" />
      ))}
    </p>
  );
}

function Mark({ right }: { right: boolean }) {
  return <dd className={right ? shared.good : shared.wrong}>{right ? "Goed" : "Fout"}</dd>;
}

// One turn after another: listen, maybe type artist and title (and the year in Expert), tap a
// gap and place, or spend tokens to skip or buy; then the sleeve reveal. The server checks
// every move; this only shows what it sends back.
export function SoloTurn(props: Props) {
  const router = useRouter();
  const playback = usePlayback();
  const [placed, setPlaced] = useState(props.placed);
  const [tokens, setTokens] = useState(props.tokens);
  const [timeline, setTimeline] = useState(props.timeline);
  const [trackId, setTrackId] = useState(props.trackId);
  const [started, setStarted] = useState(false);
  const [gap, setGap] = useState<number | null>(null);
  const [artist, setArtist] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [reveal, setReveal] = useState<PlacementReveal | null>(null);
  const [problem, setProblem] = useState<keyof typeof problemText | null>(null);
  const [pending, startTransition] = useTransition();
  const expert = props.variant === "expert";

  function startSong() {
    playback.play(trackId);
    setStarted(true);
  }

  function play(move: () => Promise<PlacementResult>) {
    setProblem(null);
    startTransition(async () => {
      const result = await move();
      if (result.ok) {
        setReveal(result.reveal);
        return;
      }
      setProblem(result.problem);
      // Another tab or a double tap got there first: reload the game where it really is.
      if (result.problem === "verouderd") router.refresh();
    });
  }

  function place() {
    if (gap === null) return;
    play(() => placeSoloCard(props.gameId, placed, gap, { artist, title, year: expert ? year : null }));
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
    setTokens(reveal.tokens);
    setTrackId(reveal.nextTrackId);
    setStarted(true);
    setGap(null);
    setArtist("");
    setTitle("");
    setYear(DEFAULT_YEAR);
    setReveal(null);
  }

  if (reveal) {
    const cards = timelineAfter(reveal).length;
    const naming = reveal.naming;
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
        <p className={`${styles.verdict} ${reveal.won ? shared.good : reveal.kind === "skipped" ? "" : shared.wrong}`}>
          {verdictOf(reveal)}
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

        <dl className={shared.scoreboard}>
          {naming ? (
            <>
              <div>
                <dt>Plek</dt>
                <Mark right={reveal.correct} />
              </div>
              <div>
                <dt>Artiest (jij: {naming.artistInput || "leeg"})</dt>
                <Mark right={naming.artistCorrect} />
              </div>
              <div>
                <dt>Titel (jij: {naming.titleInput || "leeg"})</dt>
                <Mark right={naming.titleCorrect} />
              </div>
              {naming.guessedYear !== null ? (
                <div>
                  <dt>Jaar (jij: {naming.guessedYear})</dt>
                  <dd className={naming.yearExact ? shared.good : shared.wrong}>
                    {yearText(naming.guessedYear, reveal.cardYear)}
                  </dd>
                </div>
              ) : null}
            </>
          ) : null}
          <div>
            <dt>Tokens ({reveal.tokens} van {MAX_TOKENS})</dt>
            <dd>{reveal.tokenChange === 0 ? "0" : signed(reveal.tokenChange)}</dd>
          </div>
        </dl>

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

      {started ? (
        <div className={styles.naming}>
          <div className={shared.field}>
            <label htmlFor="artist">Artiest</label>
            <input
              id="artist"
              value={artist}
              onChange={(event) => setArtist(event.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={200}
              placeholder={props.variant === "original" ? "Mag leeg, voor een token" : "Typfouten mogen"}
            />
          </div>
          <div className={shared.field}>
            <label htmlFor="title">Titel</label>
            <input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              placeholder={props.variant === "original" ? "Mag leeg, voor een token" : "Typfouten mogen"}
            />
          </div>
          {expert ? <YearRuler value={year} onChange={setYear} /> : null}
        </div>
      ) : null}

      <section aria-label="Jouw tijdlijn">
        <Tokens count={tokens} />
        <TimelineLadder cards={toLadder(timeline)} selected={gap} onSelect={setGap} disabled={pending} />
      </section>

      {problem ? (
        <p className={shared.problem} role="alert">
          {problemText[problem]}
        </p>
      ) : null}

      {started ? (
        <div className={shared.actions}>
          <button type="button" className={shared.cta} onClick={place} disabled={gap === null || pending}>
            {gap === null ? "Tik op een plek" : "Plaatsen"}
          </button>
          <div className={styles.spend}>
            <button
              type="button"
              className={shared.secondary}
              onClick={() => play(() => skipSoloSong(props.gameId, placed))}
              disabled={tokens < SKIP_COST || pending}
            >
              Overslaan · {SKIP_COST}
            </button>
            <button
              type="button"
              className={shared.secondary}
              onClick={() => play(() => buySoloCard(props.gameId, placed))}
              disabled={tokens < BUY_COST || pending}
            >
              Kopen · {BUY_COST}
            </button>
          </div>
        </div>
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
