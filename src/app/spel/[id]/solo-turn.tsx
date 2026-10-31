"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GuessCard } from "@/components/guess-card/guess-card";
import {
  DeviceButton,
  ElapsedTime,
  OnDevice,
  PlayButton,
  PlaybackProblem,
  RestartButton,
  Vinyl,
  playbackStatusText,
} from "@/components/record-player/record-player";
import { TimelineLadder, type LadderCard } from "@/components/timeline-ladder/timeline-ladder";
import { YearAxis } from "@/components/year-axis/year-axis";
import { YearCorrection } from "@/components/year-correction/year-correction";
import { clampYear, DEFAULT_YEAR } from "@/components/year-ruler/ruler";
import { gapLabel } from "@/lib/game/placement";
import { BUY_COST, MAX_TOKENS, SKIP_COST, WINNING_CARDS, type TimelineCard, type Variant } from "@/lib/game/state";
import { usePlayback } from "@/lib/playback/use-playback";
import { buySoloCard, placeSoloCard, skipSoloSong, type PlacementReveal, type PlacementResult } from "../actions";
import shared from "../../oefenen/oefenen.module.css";
import styles from "./turn.module.css";

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
  return off === 0 ? "precies" : `${off} jaar ernaast`;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// One coin per token, out of the five you can hold.
function Coins({ count }: { count: number }) {
  return (
    <span className={styles.coins} aria-label={`${count} van ${MAX_TOKENS} tokens`} role="img">
      {Array.from({ length: MAX_TOKENS }, (_, i) => (
        <span key={i} className={`${styles.coin} ${i < count ? styles.coinOn : ""}`} />
      ))}
    </span>
  );
}

// Overslaan and Kopen as small icon buttons with their token cost on a coin badge.
function SpendButton({ kind, disabled, onClick }: { kind: "skip" | "buy"; disabled: boolean; onClick: () => void }) {
  const cost = kind === "skip" ? SKIP_COST : BUY_COST;
  return (
    <button
      type="button"
      className={styles.spend}
      onClick={onClick}
      disabled={disabled}
      aria-label={kind === "skip" ? `Overslaan voor ${cost} token` : `Kaart kopen voor ${cost} tokens`}
      title={kind === "skip" ? "Overslaan" : "Kaart kopen"}
    >
      {kind === "skip" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5.5l9.5 6.5L5 18.5z" fill="currentColor" />
          <path d="M18 5.5v13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2.5" />
          <path d="M12 8.5v7M8.5 12h7" />
        </svg>
      )}
      <span className={styles.badge} aria-hidden="true">
        {cost}
      </span>
    </button>
  );
}

// Scrolling down shrinks the record into a bar at the top (prototype "staand 1"): --t runs
// from 0 (full record) to 1 (bar), and the CSS does the rest.
function useShrinkingHero() {
  const hero = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = hero.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const range = el.offsetHeight - parseFloat(getComputedStyle(el).getPropertyValue("--bar") || "72");
      const t = range > 0 ? Math.min(1, Math.max(0, -el.getBoundingClientRect().top / range)) : 0;
      el.style.setProperty("--t", t.toFixed(3));
      el.dataset.collapsed = String(t > 0.6);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);
  return hero;
}

// One turn after another: start the song, tap a gap, name the song on the orange card and
// place it, or spend tokens to skip or buy; then the reveal. The server checks every move;
// this only shows what it sends back. Upright it is a ladder under a shrinking record; on its
// side it is the timeline to scale under a slim player bar.
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
  const hero = useShrinkingHero();
  const board = useRef<HTMLElement>(null);
  const expert = props.variant === "expert";

  // Show the revealed card: scroll the upright ladder to it.
  useEffect(() => {
    if (!reveal) return;
    const card = board.current?.querySelector("[data-mark]");
    if (card instanceof HTMLElement && card.offsetParent !== null) card.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [reveal]);

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
    play(() => placeSoloCard(props.gameId, placed, gap, { artist, title, year: expert ? clampYear(year) : null }));
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

  const song = reveal ? reveal.placed : placed + 1;
  const cardsNow = reveal ? timelineAfter(reveal).length : timeline.length;
  const cards = reveal ? revealLadder(reveal) : toLadder(timeline);
  const years = timeline.map((c) => c.year);
  const where = gap === null ? "" : gapLabel(years, gap);
  const locked = !started || pending || reveal !== null;
  const hint = !started
    ? "Druk op play en luister"
    : gap === null
      ? "Tik tussen twee kaarten"
      : "Vul in en tik Plaats hier";

  function guess(layout: "card" | "bar") {
    return (
      <GuessCard
        layout={layout}
        variant={props.variant}
        song={placed + 1}
        where={where}
        artist={artist}
        title={title}
        onArtist={setArtist}
        onTitle={setTitle}
        year={expert ? year : null}
        onYear={setYear}
        ready={started}
        pending={pending}
        onPlace={place}
        onClear={() => setGap(null)}
      />
    );
  }

  const skip = (
    <SpendButton kind="skip" disabled={locked || tokens < SKIP_COST} onClick={() => play(() => skipSoloSong(props.gameId, placed))} />
  );
  const buy = (
    <SpendButton kind="buy" disabled={locked || tokens < BUY_COST} onClick={() => play(() => buySoloCard(props.gameId, placed))} />
  );
  const problemLine = problem ? (
    <p className={shared.problem} role="alert">
      {problemText[problem]}
    </p>
  ) : null;
  const count = (
    <p className={styles.count}>
      <b>{cardsNow}</b> van {WINNING_CARDS} kaarten
    </p>
  );

  return (
    <div className={styles.stage}>
      {/* Upright: record that shrinks into a bar, compact ladder, actions at the bottom. */}
      <div className={styles.portrait}>
        <header className={styles.hero} ref={hero}>
          <div className={styles.topbar}>
            <Link href="/" className={styles.back}>
              ← Home
            </Link>
            <span className={styles.songNumber}>Nummer {song}</span>
          </div>
          <Vinyl playback={playback} className={styles.heroRecord} />
          <div className={styles.heroStatus}>
            <p role="status">{playbackStatusText(playback)}</p>
            <OnDevice playback={playback} />
          </div>
          <div className={styles.heroControls}>
            <RestartButton playback={playback} />
            <PlayButton playback={playback} started={started} onStart={startSong} />
            <ElapsedTime playback={playback} />
            <DeviceButton playback={playback} />
          </div>
          <div className={styles.bar}>
            <div className={styles.barInfo}>
              <b>Nummer {song}</b>
              <span>
                {playbackStatusText(playback)} · <ElapsedTime playback={playback} className={styles.barTime} />
              </span>
            </div>
            <RestartButton playback={playback} className={styles.barRound} />
            <PlayButton playback={playback} started={started} onStart={startSong} className={styles.barPlay} />
            <DeviceButton playback={playback} className={styles.barRound} />
          </div>
        </header>

        <section className={`${styles.board} ${reveal ? styles.boardReveal : ""}`} ref={board} aria-label="Jouw tijdlijn">
          <PlaybackProblem playback={playback} />
          <div className={styles.boardHead}>
            {count}
            <Coins count={reveal ? reveal.tokens : tokens} />
          </div>
          {reveal ? null : problemLine}
          <TimelineLadder
            compact
            cards={cards}
            selected={reveal ? null : gap}
            onSelect={reveal ? undefined : setGap}
            disabled={pending}
            selectedContent={reveal || gap === null ? undefined : guess("card")}
          />
        </section>

        {reveal ? null : (
          <div className={styles.actionBar}>
            {skip}
            <p className={`${styles.hint} ${gap !== null ? styles.hintOn : ""}`}>{hint}</p>
            {buy}
          </div>
        )}
      </div>

      {/* On its side: slim player bar, the timeline to scale, and the orange bar to name and place. */}
      <div className={styles.landscape}>
        <div className={styles.topRow}>
          <Link href="/" className={styles.backSmall} aria-label="Naar home">
            ←
          </Link>
          <Vinyl playback={playback} className={styles.smallRecord} arm={false} />
          <PlayButton playback={playback} started={started} onStart={startSong} className={styles.barPlay} />
          <ElapsedTime playback={playback} className={styles.rowTime} />
          <DeviceButton playback={playback} className={styles.barRound} />
          <span className={styles.songNumber}>Nummer {song}</span>
          {count}
          <span className={styles.spacer} />
          <OnDevice playback={playback} className={styles.rowDevice} />
          <Coins count={reveal ? reveal.tokens : tokens} />
          {skip}
          {buy}
        </div>
        <PlaybackProblem playback={playback} className={styles.floatingProblem} />
        <YearAxis cards={cards} selected={reveal ? null : gap} onSelect={reveal ? undefined : setGap} disabled={pending} />
        <div className={styles.bottomRow}>
          {reveal ? null : gap === null ? <p className={styles.rowHint}>{problem ? problemText[problem] : hint}</p> : guess("bar")}
        </div>
      </div>

      {reveal ? <Reveal reveal={reveal} canCorrectYears={props.canCorrectYears} onNext={next} /> : null}
    </div>
  );
}

function Mark({ right }: { right: boolean }) {
  return <b className={right ? styles.good : styles.wrong}>{right ? "goed" : "fout"}</b>;
}

// The sleeve after a move: the song, how it went, and the button to the next one. A sheet at
// the bottom when upright, a panel on the right on its side.
function Reveal({ reveal, canCorrectYears, onNext }: { reveal: PlacementReveal; canCorrectYears: boolean; onNext: () => void }) {
  const naming = reveal.naming;
  const tone = reveal.kind === "skipped" ? styles.skipped : reveal.won ? styles.revealGood : styles.revealWrong;
  return (
    <section className={`${styles.reveal} ${tone}`} aria-label="Het nummer">
      <div className={styles.sleeve}>
        {reveal.coverUrl ? (
          // Spotify's own cover, shown as ADR 0001 requires.
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.cover} src={reveal.coverUrl} alt="" width={76} height={76} />
        ) : (
          <span className={styles.cover} aria-hidden="true" />
        )}
        <div className={styles.sleeveText}>
          <p className={styles.verdict}>{verdictOf(reveal)}</p>
          <p className={styles.sleeveYear}>
            {reveal.cardYear}
            {reveal.uncertainYear ? <span className={styles.uncertain}>jaar onzeker</span> : null}
          </p>
          <p className={styles.sleeveTitle}>{reveal.title}</p>
          <p className={styles.sleeveArtist}>{reveal.artist}</p>
        </div>
      </div>
      {canCorrectYears ? <YearCorrection key={reveal.songId} songId={reveal.songId} cardYear={reveal.cardYear} /> : null}

      <p className={styles.scores}>
        {naming ? (
          <>
            <span>
              Artiest <Mark right={naming.artistCorrect} />
            </span>
            <span>
              Titel <Mark right={naming.titleCorrect} />
            </span>
            {naming.guessedYear !== null ? (
              <span>
                Jaar <b className={naming.yearExact ? styles.good : styles.wrong}>{yearText(naming.guessedYear, reveal.cardYear)}</b>
              </span>
            ) : null}
          </>
        ) : null}
        <span>
          Tokens <b>{reveal.tokenChange === 0 ? "0" : signed(reveal.tokenChange)}</b>
        </span>
      </p>
      {naming && (naming.artistInput || naming.titleInput) ? (
        <p className={styles.typed}>
          Jij: {[naming.artistInput, naming.titleInput].filter(Boolean).join(" · ")}
        </p>
      ) : null}

      {reveal.outcome === "won" ? (
        <p className={styles.record}>
          10 kaarten in {reveal.songsNeeded} nummers
          {reveal.newRecord && reveal.personalBest !== null ? " · Nieuw record!" : null}
        </p>
      ) : null}
      {reveal.outcome === "deck_empty" ? <p className={shared.hint}>De stapel is op. Dit spel krijgt geen score.</p> : null}

      <button type="button" className={styles.next} onClick={onNext}>
        {reveal.nextTrackId === null ? "Naar de uitslag" : "Volgend nummer"}
      </button>
    </section>
  );
}
