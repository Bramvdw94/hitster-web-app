import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { boxMove, KNOWN_BOX } from "@/lib/practice/leitner";
import { loadCandidates } from "@/lib/practice/progress";
import { summarise } from "@/lib/practice/scoring";
import {
  cardYearsOf,
  finishSession,
  loadSession,
  titlesOf,
  trackIdOf,
  type SessionState,
} from "@/lib/practice/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { startPractice } from "../actions";
import { PracticeTurn } from "./practice-turn";
import styles from "../oefenen.module.css";

export const metadata = { title: "Oefenen · Jaartal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatYearsOff(value: number): string {
  return value.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

async function Summary({ state }: { state: SessionState }) {
  const supabase = await createClient();
  const [cardYears, titles, candidates] = await Promise.all([
    cardYearsOf(supabase, state.session.song_ids),
    titlesOf(supabase, state.session.song_ids),
    loadCandidates(supabase, state.session.edition_ids),
  ]);
  const moves = state.attempts
    .map((a) => ({ ...a, move: boxMove(a.box_before, a.box_after), title: titles.get(a.song_id) ?? "" }))
    .filter((a) => a.move !== "same");
  const known = candidates.filter((c) => c.box === KNOWN_BOX).length;
  const summary = summarise(
    state.attempts
      .filter((a) => cardYears.has(a.song_id))
      .map((a) => ({ cardYear: cardYears.get(a.song_id)!, yearDiff: a.year_diff, points: a.points })),
  );

  return (
    <>
      <section className={styles.total} aria-label="Score">
        <p className={styles.section}>Ronde {state.session.session_number}</p>
        <p className={styles.totalScore}>
          {summary.points}
          <span> / {summary.maxPoints}</span>
        </p>
        <p className={styles.hint}>
          {summary.averageYearsOff === null
            ? "Je hebt geen jaar geraden."
            : `Gemiddeld ${formatYearsOff(summary.averageYearsOff)} jaar ernaast.`}
        </p>
      </section>

      <section>
        <h2 className={styles.section}>Per decennium</h2>
        <ul className={styles.decades}>
          {summary.decades.map((d) => (
            <li key={d.decade} className={styles.decade}>
              <span className={styles.decadeName}>{d.decade}</span>
              <span className={styles.bar} aria-hidden="true">
                <span style={{ width: `${(d.points / d.maxPoints) * 100}%` }} />
              </span>
              <span className={styles.decadeScore}>
                {d.points}/{d.maxPoints}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={styles.section}>Dozen</h2>
        <p className={styles.hint}>
          {known} van {candidates.length} gekend
          {state.session.weak_only || state.session.edition_ids.length === 0 ? " in alle edities" : " in deze edities"}.
        </p>
        {moves.length > 0 ? (
          <ul className={styles.moves}>
            {moves.map((m) => (
              <li key={m.song_id} className={styles.move}>
                <span
                  className={m.move === "up" ? styles.good : styles.wrong}
                  role="img"
                  aria-label={m.move === "up" ? "omhoog" : "omlaag"}
                >
                  {m.move === "up" ? "▲" : "▼"}
                </span>
                <span className={styles.moveTitle}>{m.title}</span>
                <span className={styles.moveBox}>doos {m.box_after}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.hint}>Geen nummer is van doos gewisseld.</p>
        )}
      </section>

      <div className={styles.actions}>
        <form action={startPractice}>
          {state.session.weak_only ? <input type="hidden" name="zwak" value="1" /> : null}
          {state.session.edition_ids.map((id) => (
            <input key={id} type="hidden" name="edition" value={id} />
          ))}
          <button type="submit" className={styles.cta}>
            Nog een ronde
          </button>
        </form>
        <Link href="/" className={styles.secondary}>
          Naar home
        </Link>
      </div>
    </>
  );
}

async function Session({ params }: { params: PageProps<"/oefenen/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  let state = await loadSession(supabase, id);
  if (!state) notFound();

  // Every song answered but the last write didn't finish the session: finish it now.
  if (state.session.status === "active" && state.current >= state.session.song_ids.length) {
    await finishSession(createAdminClient(), id);
    state = { ...state, session: { ...state.session, status: "finished" } };
  }

  if (state.session.status === "finished") return <Summary state={state} />;

  return (
    <PracticeTurn
      key={state.current}
      sessionId={id}
      songIndex={state.current}
      songCount={state.session.song_ids.length}
      points={state.points}
      trackId={await trackIdOf(supabase, state.session.song_ids[state.current])}
    />
  );
}

export default function PracticeSessionPage({ params }: PageProps<"/oefenen/[id]">) {
  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <Link href="/" className={styles.back}>
          ← Home
        </Link>
        <h1 className={styles.topTitle}>Oefenen</h1>
      </header>
      <Suspense fallback={<div className={styles.placeholder} />}>
        <Session params={params} />
      </Suspense>
    </main>
  );
}
