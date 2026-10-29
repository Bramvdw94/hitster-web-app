"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RecordPlayer } from "@/components/record-player/record-player";
import { DEFAULT_YEAR } from "@/components/year-ruler/ruler";
import { YearRuler } from "@/components/year-ruler/year-ruler";
import { usePlayback } from "@/lib/playback/use-playback";
import { answerSong, type Reveal } from "../actions";
import styles from "../oefenen.module.css";

type Props = {
  sessionId: string;
  songIndex: number;
  songCount: number;
  points: number;
  trackId: string;
};

const problemText = {
  verouderd: "Dit nummer was al beantwoord. Je gaat verder bij het volgende.",
  mislukt: "Je antwoord kwam niet aan. Probeer het nog eens.",
} as const;

function yearText(reveal: Reveal): string {
  if (reveal.guessedYear === null) return "Ken ik niet";
  const off = Math.abs(reveal.guessedYear - reveal.cardYear);
  return off === 0 ? "Precies" : `${off} jaar ernaast`;
}

const yearClass = {
  exact: styles.good,
  close: styles.close,
  near: styles.close,
  wrong: styles.wrong,
  unknown: styles.wrong,
} as const;

// One song after another: listen, set the year, maybe type the artist, then the sleeve reveal.
// The server scores every answer; this only shows what it sends back.
export function PracticeTurn(props: Props) {
  const router = useRouter();
  const playback = usePlayback();
  const [songIndex, setSongIndex] = useState(props.songIndex);
  const [trackId, setTrackId] = useState(props.trackId);
  const [points, setPoints] = useState(props.points);
  const [started, setStarted] = useState(false);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [artist, setArtist] = useState("");
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [problem, setProblem] = useState<keyof typeof problemText | null>(null);
  const [pending, startTransition] = useTransition();

  function startSong() {
    playback.play(trackId);
    setStarted(true);
  }

  function submit(guessedYear: number | null) {
    setProblem(null);
    startTransition(async () => {
      const result = await answerSong(props.sessionId, songIndex, guessedYear, artist);
      if (result.ok) {
        setReveal(result.reveal);
        setPoints(result.reveal.totalPoints);
        return;
      }
      setProblem(result.problem);
      // Another tab or a double tap got there first: reload the session where it really is.
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
    setTrackId(reveal.nextTrackId);
    setSongIndex(reveal.answered);
    setStarted(true);
    setYear(DEFAULT_YEAR);
    setArtist("");
    setReveal(null);
  }

  const status = (
    <p className={styles.status}>
      <span>
        Nummer <b>{(reveal ? reveal.answered : songIndex + 1)}</b> van {props.songCount}
      </span>
      <span>
        <b>{points}</b> punten
      </span>
    </p>
  );

  if (reveal) {
    return (
      <>
        {status}
        <section className={styles.sleeve} aria-label="Het nummer">
          {reveal.coverUrl ? (
            // Spotify's own cover, shown as ADR 0001 requires.
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.cover} src={reveal.coverUrl} alt="" width={96} height={96} />
          ) : (
            <span className={styles.cover} aria-hidden="true" />
          )}
          <div className={styles.sleeveText}>
            <p className={styles.sleeveYear}>{reveal.cardYear}</p>
            {reveal.uncertainYear ? <p className={styles.uncertain}>jaar onzeker</p> : null}
            <p className={styles.sleeveTitle}>{reveal.title}</p>
            <p className={styles.sleeveArtist}>{reveal.artist}</p>
          </div>
        </section>

        <dl className={styles.scoreboard}>
          <div>
            <dt>Jaar {reveal.guessedYear !== null ? `(jij: ${reveal.guessedYear})` : null}</dt>
            <dd className={yearClass[reveal.yearResult]}>{yearText(reveal)}</dd>
          </div>
          {reveal.guessedYear !== null ? (
            <div>
              <dt>Artiest (jij: {reveal.artistInput || "leeg"})</dt>
              <dd className={reveal.artistCorrect ? styles.good : styles.wrong}>
                {reveal.artistCorrect ? "Goed" : "Fout"}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Punten</dt>
            <dd>+{reveal.points}</dd>
          </div>
          <div>
            <dt>Totaal</dt>
            <dd>{reveal.totalPoints}</dd>
          </div>
        </dl>

        <button type="button" className={styles.cta} onClick={next}>
          {reveal.nextTrackId === null ? "Naar de uitslag" : "Volgende"}
        </button>
      </>
    );
  }

  return (
    <>
      {status}
      <RecordPlayer playback={playback} />

      {started ? (
        <form
          className={styles.answer}
          onSubmit={(event) => {
            event.preventDefault();
            submit(year);
          }}
        >
          <YearRuler value={year} onChange={setYear} />
          <div className={styles.field}>
            <label htmlFor="artist">Artiest</label>
            <input
              id="artist"
              value={artist}
              onChange={(event) => setArtist(event.target.value)}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={200}
              placeholder="Mag leeg, typfouten mogen"
            />
          </div>
          {problem ? (
            <p className={styles.problem} role="alert">
              {problemText[problem]}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button type="submit" className={styles.cta} disabled={pending}>
              Raden
            </button>
            <button type="button" className={styles.secondary} onClick={() => submit(null)} disabled={pending}>
              Ken ik niet
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className={styles.cta}
          onClick={startSong}
          disabled={playback.state.status === "verbinden"}
        >
          {playback.state.status === "verbinden" ? "Speler verbinden…" : "Zet de plaat op"}
        </button>
      )}
    </>
  );
}
