"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecordPlayer } from "@/components/record-player/record-player";
import { TimelineLadder, type LadderCard } from "@/components/timeline-ladder/timeline-ladder";
import { YearCorrection } from "@/components/year-correction/year-correction";
import { fitsGap } from "@/lib/game/placement";
import type { TimelineCard } from "@/lib/game/state";
import type { RevealedCard, TogetherView } from "@/lib/game/together-view";
import { BUY_COST, SKIP_COST, STEAL_COST, stealOrder, type Seat, type Steal } from "@/lib/game/together";
import { usePlayback } from "@/lib/playback/use-playback";
import { buyTogether, judgeTogether, lockTogether, skipTogether, type MoveResult, type TurnSummary } from "../actions";
import { Standings } from "../standings";
import shared from "../../oefenen/oefenen.module.css";
import spel from "../../spel/spel.module.css";
import styles from "../samen.module.css";

type Props = {
  gameId: string;
  view: TogetherView;
  canCorrectYears: boolean;
};

// The phases of one turn. "steal" walks the others in play order; `choosing` is the one who
// said Hitster! and now picks a gap.
type Step =
  | { kind: "handover" }
  | { kind: "place"; gap: number | null }
  | { kind: "steal"; gap: number; steals: Steal[]; asking: number; choosing: boolean; pick: number | null }
  | { kind: "judge" }
  | { kind: "result"; summary: TurnSummary };

const problemText = {
  verouderd: "Deze beurt was al gespeeld. Het spel gaat verder waar het is.",
  mislukt: "Dat kwam niet aan. Probeer het nog eens.",
} as const;

const toLadder = (cards: TimelineCard[]): LadderCard[] => cards.map((c) => ({ key: c.songId, ...c }));

function Tokens({ seat }: { seat: Seat }) {
  return (
    <span className={styles.tokens} aria-label={`${seat.tokens} tokens`}>
      {Array.from({ length: seat.tokens }, (_, i) => (
        <span key={i} className={styles.token} aria-hidden="true" />
      ))}
    </span>
  );
}

function Sleeve({ card, canCorrectYears }: { card: RevealedCard; canCorrectYears: boolean }) {
  return (
    <section className={shared.sleeve} aria-label="Het nummer">
      {card.coverUrl ? (
        // Spotify's own cover, shown as ADR 0001 requires.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={shared.cover} src={card.coverUrl} alt="" width={96} height={96} />
      ) : (
        <span className={shared.cover} aria-hidden="true" />
      )}
      <div className={shared.sleeveText}>
        <p className={shared.sleeveYear}>{card.year}</p>
        {card.uncertainYear ? <p className={shared.uncertain}>jaar onzeker</p> : null}
        <p className={shared.sleeveTitle}>{card.title}</p>
        <p className={shared.sleeveArtist}>{card.artist}</p>
        {canCorrectYears ? <YearCorrection key={card.songId} songId={card.songId} cardYear={card.year} /> : null}
      </div>
    </section>
  );
}

function Tap({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className={styles.tap}>
      <p className={styles.tapLabel}>{label}</p>
      <div className={styles.tapButtons}>
        <button
          type="button"
          className={`${styles.tapButton} ${value === true ? styles.tapGood : ""}`}
          aria-pressed={value === true}
          onClick={() => onChange(true)}
        >
          Goed
        </button>
        <button
          type="button"
          className={`${styles.tapButton} ${value === false ? styles.tapWrong : ""}`}
          aria-pressed={value === false}
          onClick={() => onChange(false)}
        >
          Fout
        </button>
      </div>
    </div>
  );
}

// One phone passed around: hand over, listen and place, Hitster! for the others, the sleeve
// reveal with the group's goed/fout taps, and the result. The server checks every move.
export function TogetherTurn(props: Props) {
  const router = useRouter();
  const playback = usePlayback();
  const [view, setView] = useState(props.view);
  const [step, setStep] = useState<Step>(props.view.locked ? { kind: "judge" } : { kind: "handover" });
  const [started, setStarted] = useState(false);
  const [named, setNamed] = useState<boolean | null>(null);
  const [exactYear, setExactYear] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<keyof typeof problemText | null>(null);
  const [pending, startTransition] = useTransition();

  const active = view.seats[view.turn];
  const timeline = active.timeline;
  const order = stealOrder(view);

  function send(action: () => Promise<MoveResult>, then: (result: Extract<MoveResult, { ok: true }>) => void) {
    setProblem(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setView(result.view);
        then(result);
        return;
      }
      setProblem(result.problem);
      // Another tab or a double tap got there first: reload the game where it really is.
      if (result.problem === "verouderd") router.refresh();
    });
  }

  function startSong() {
    if (view.trackId) playback.play(view.trackId);
    setStarted(true);
  }

  // The phone is with the active player: their tap starts the song, so the phone lets it play.
  function takeOver() {
    startSong();
    setStep({ kind: "place", gap: null });
  }

  function skip() {
    send(
      () => skipTogether(props.gameId, view.moves),
      () => {
        setStarted(false);
        setStep({ kind: "place", gap: null });
      },
    );
  }

  function buy() {
    send(
      () => buyTogether(props.gameId, view.moves),
      (result) => {
        playback.pause();
        if (result.summary) setStep({ kind: "result", summary: result.summary });
      },
    );
  }

  function lock(gap: number, steals: Steal[]) {
    send(
      () => lockTogether(props.gameId, view.moves, gap, steals),
      () => {
        setNamed(null);
        setExactYear(null);
        setStep({ kind: "judge" });
      },
    );
  }

  // The next one in line for Hitster!, or the reveal when everyone answered.
  function askNext(gap: number, steals: Steal[], from: number) {
    if (from >= order.length) lock(gap, steals);
    else setStep({ kind: "steal", gap, steals, asking: from, choosing: false, pick: null });
  }

  function judge() {
    send(
      () => judgeTogether(props.gameId, view.moves, { named: named === true, exactYear: exactYear === true }),
      (result) => {
        playback.pause();
        if (result.summary) setStep({ kind: "result", summary: result.summary });
      },
    );
  }

  function nextTurn() {
    if (view.over) {
      router.refresh();
      return;
    }
    setStarted(false);
    setStep({ kind: "handover" });
  }

  const problemLine = problem ? (
    <p className={shared.problem} role="alert">
      {problemText[problem]}
    </p>
  ) : null;

  if (step.kind === "handover") {
    return (
      <>
        <Standings seats={view.seats} turn={view.turn} />
        <section className={styles.handover}>
          <p className={shared.section}>Geef de telefoon aan</p>
          <p className={styles.handoverName}>{active.name}</p>
        </section>
        <button type="button" className={shared.cta} onClick={takeOver}>
          Ik ben {active.name}
        </button>
      </>
    );
  }

  if (step.kind === "place") {
    const canSkip = active.tokens >= SKIP_COST;
    const canBuy = active.tokens >= BUY_COST;
    return (
      <>
        <p className={shared.status}>
          <span>
            Beurt van <b>{active.name}</b>
          </span>
          <Tokens seat={active} />
        </p>
        <RecordPlayer playback={playback} started={started} onStart={startSong} />

        <section aria-label={`Tijdlijn van ${active.name}`}>
          <h2 className={shared.section}>Tijdlijn van {active.name}</h2>
          <TimelineLadder
            cards={toLadder(timeline)}
            selected={step.gap}
            onSelect={(gap) => setStep({ kind: "place", gap })}
            disabled={pending}
          />
        </section>

        {problemLine}

        {started ? (
          <div className={shared.actions}>
            <button
              type="button"
              className={shared.cta}
              onClick={() => step.gap !== null && askNext(step.gap, [], 0)}
              disabled={step.gap === null || pending}
            >
              {step.gap === null ? "Tik op een plek" : "Plaatsen"}
            </button>
            {canSkip || canBuy ? (
              <div className={styles.spend}>
                {canSkip ? (
                  <button type="button" className={shared.secondary} onClick={skip} disabled={pending}>
                    Overslaan · {SKIP_COST} token
                  </button>
                ) : null}
                {canBuy ? (
                  <button type="button" className={shared.secondary} onClick={buy} disabled={pending}>
                    Kopen · {BUY_COST} tokens
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className={shared.hint}>Druk op de oranje play om het nummer te starten.</p>
        )}
      </>
    );
  }

  if (step.kind === "steal") {
    const seat = order[step.asking];
    const stealer = view.seats[seat];
    const taken: Record<number, string> = { [step.gap]: active.name };
    for (const s of step.steals) taken[s.gap] = view.seats[s.seat].name;
    const free = timeline.length + 1 - Object.keys(taken).length;

    return (
      <>
        <p className={shared.status}>
          <span>
            Beurt van <b>{active.name}</b>
          </span>
          <span>Hitster!</span>
        </p>
        <section className={styles.handover}>
          <p className={shared.section}>{step.choosing ? "Kies een andere plek" : "Wil je stelen?"}</p>
          <p className={styles.handoverName}>{stealer.name}</p>
          <p className={styles.tokenLine}>
            <Tokens seat={stealer} /> {stealer.tokens} {stealer.tokens === 1 ? "token" : "tokens"}
          </p>
        </section>

        <TimelineLadder
          cards={toLadder(timeline)}
          taken={taken}
          selected={step.choosing ? step.pick : null}
          onSelect={step.choosing ? (gap) => setStep({ ...step, pick: gap }) : undefined}
          disabled={pending}
        />

        {problemLine}

        {step.choosing ? (
          <div className={shared.actions}>
            <button
              type="button"
              className={shared.cta}
              disabled={step.pick === null || pending}
              onClick={() =>
                step.pick !== null && askNext(step.gap, [...step.steals, { seat, gap: step.pick }], step.asking + 1)
              }
            >
              {step.pick === null ? "Tik op een plek" : "Hier stelen"}
            </button>
            <button
              type="button"
              className={shared.secondary}
              onClick={() => setStep({ ...step, choosing: false, pick: null })}
              disabled={pending}
            >
              Toch niet
            </button>
          </div>
        ) : (
          <div className={shared.actions}>
            <button
              type="button"
              className={shared.cta}
              disabled={free === 0 || pending}
              onClick={() => setStep({ ...step, choosing: true })}
            >
              Stelen · {STEAL_COST} token
            </button>
            <button
              type="button"
              className={shared.secondary}
              onClick={() => askNext(step.gap, step.steals, step.asking + 1)}
              disabled={pending}
            >
              Nee, {stealer.name} steelt niet
            </button>
          </div>
        )}
      </>
    );
  }

  if (step.kind === "judge") {
    const card = view.song;
    const locked = view.locked;
    if (!card || !locked) return null;
    const years = timeline.map((c) => c.year);
    const taken: Record<number, string> = { [locked.gap]: active.name };
    for (const s of locked.steals) taken[s.gap] = view.seats[s.seat].name;
    const placedRight = fitsGap(years, locked.gap, card.year);
    const expert = view.variant === "expert";
    const ready = named !== null && (!expert || exactYear !== null);

    return (
      <>
        <p className={shared.status}>
          <span>
            Beurt van <b>{active.name}</b>
          </span>
          <span>{placedRight ? "Goed geplaatst" : "Verkeerde plek"}</span>
        </p>
        <Sleeve card={card} canCorrectYears={props.canCorrectYears} />
        <TimelineLadder cards={toLadder(timeline)} taken={taken} />

        <section className={styles.taps} aria-label="Wat zei de groep?">
          <Tap label={`Noemde ${active.name} artiest én titel?`} value={named} onChange={setNamed} />
          {expert ? <Tap label="En het exacte jaar?" value={exactYear} onChange={setExactYear} /> : null}
        </section>

        {problemLine}

        <button type="button" className={shared.cta} onClick={judge} disabled={!ready || pending}>
          {ready ? "Uitslag" : "Tik goed of fout"}
        </button>
      </>
    );
  }

  // The result of the turn.
  const summary = step.summary;
  let verdict: string;
  let tone: string;
  if (summary.kind === "buy") {
    verdict = `${view.seats[summary.seat].name} koopt de kaart`;
    tone = shared.good;
  } else if (summary.kind === "judged" && summary.winner !== null) {
    const name = view.seats[summary.winner].name;
    verdict = summary.stolen ? `${name} steelt de kaart!` : `${name} wint de kaart`;
    tone = shared.good;
  } else {
    verdict = "Niemand wint de kaart";
    tone = shared.wrong;
  }

  return (
    <>
      <p className={`${spel.verdict} ${tone}`}>{verdict}</p>
      {summary.kind !== "skip" ? <Sleeve card={summary.card} canCorrectYears={false} /> : null}
      {summary.kind === "judged" && summary.earned > 0 ? (
        <p className={styles.earned}>+1 token voor {view.seats[summary.seat].name}</p>
      ) : null}
      {view.winner !== null ? <p className={spel.record}>{view.seats[view.winner].name} heeft 10 kaarten!</p> : null}
      {view.over && view.winner === null ? <p className={shared.hint}>De stapel is op.</p> : null}
      <Standings seats={view.seats} turn={view.over ? null : view.turn} />
      <button type="button" className={shared.cta} onClick={nextTurn} disabled={pending}>
        {view.over ? "Naar de uitslag" : `Volgende: ${view.seats[view.turn].name}`}
      </button>
    </>
  );
}
