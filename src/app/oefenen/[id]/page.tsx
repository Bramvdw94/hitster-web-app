import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { artistName } from "@/lib/explore/explore";
import { isFiltered, rangeLabel, type PracticeFilter } from "@/lib/practice/filter";
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
import { canCorrectYears } from "@/lib/year-correction/actions";
import { startPractice } from "../actions";
import { PracticeTurn } from "./practice-turn";
import styles from "../oefenen.module.css";

export const metadata = { title: "Oefenen · Jaartal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatYearsOff(value: number): string {
  return value.toLocaleString("nl-NL", { maximumFractionDigits: 1 });
}

// "Queen · 80s": what the session was filtered on, or null.
function filterText(artist: string | null, filter: PracticeFilter): string | null {
  const parts = [artist, rangeLabel(filter)].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

async function Summary({ state }: { state: SessionState }) {
  const supabase = await createClient();
  const { session } = state;
  const filter: PracticeFilter = { artistId: session.artist_id, yearFrom: session.year_from, yearTo: session.year_to };
  const [cardYears, titles, candidates, artist] = await Promise.all([
    cardYearsOf(supabase, session.song_ids),
    titlesOf(supabase, session.song_ids),
    loadCandidates(supabase, session.edition_ids, false, filter),
    artistName(supabase, session.artist_id),
  ]);
  const chosen = filterText(artist, filter);
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
        {chosen ? <p className={styles.filterLabel}>{chosen}</p> : null}
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
          {isFiltered(filter)
            ? " met deze keuze"
            : state.session.weak_only || state.session.edition_ids.length === 0
              ? " in alle edities"
              : " in deze edities"}
          .
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
          {session.artist_id ? <input type="hidden" name="artiest" value={session.artist_id} /> : null}
          {session.year_from !== null ? <input type="hidden" name="van" value={session.year_from} /> : null}
          {session.year_to !== null ? <input type="hidden" name="tot" value={session.year_to} /> : null}
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
      canCorrectYears={await canCorrectYears()}
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
