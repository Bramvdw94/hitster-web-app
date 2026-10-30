import Link from "next/link";
import { Suspense } from "react";
import { findActiveGame, gamePath } from "@/lib/game/games";
import { WINNING_CARDS } from "@/lib/game/state";
import { createClient } from "@/lib/supabase/server";
import { EditionPicker, type EditionOption } from "../oefenen/edition-picker";
import shared from "../oefenen/oefenen.module.css";
import { startSoloGame } from "./actions";
import { StartButton } from "./start-button";
import styles from "./spel.module.css";

export const metadata = { title: "Spel · Jaartal" };

const problems: Record<string, string> = {
  geen_nummers: "Er zijn te weinig speelbare nummers in deze edities.",
  starten: "Het spel kon niet starten. Probeer het nog eens.",
};

const variants = [
  { id: "original", name: "Original", hint: "Alleen de plek op de tijdlijn", ready: true },
  { id: "pro", name: "Pro", hint: "Plus artiest en titel", ready: false },
  { id: "expert", name: "Expert", hint: "Plus het exacte jaar", ready: false },
];

function Choice({ name, hint, checked, ready }: { name: string; hint: string; checked: boolean; ready: boolean }) {
  return (
    <label className={`${shared.option} ${ready ? "" : styles.later}`}>
      <input type="radio" checked={checked} disabled={!ready} readOnly />
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.choiceText}>
        <span className={shared.optionName}>{name}</span>
        <span className={styles.choiceHint}>{hint}</span>
      </span>
      {ready ? null : <span className={styles.soon}>Binnenkort</span>}
    </label>
  );
}

async function Setup({ searchParams }: { searchParams: PageProps<"/spel">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;

  const [running, { data: editions, error }, { count: allCount, error: countError }] = await Promise.all([
    playerId ? findActiveGame(supabase, playerId) : null,
    supabase
      .from("edition_song_counts")
      .select("id, name, song_count")
      .order("is_expansion")
      .order("name")
      .returns<EditionOption[]>(),
    supabase.from("playable_songs").select("id", { count: "exact", head: true }),
  ]);
  if (error) throw error;
  if (countError) throw countError;

  const { fout } = await searchParams;
  const problem = typeof fout === "string" ? problems[fout] : undefined;

  return (
    <form action={startSoloGame} className={shared.setup}>
      {problem ? (
        <p className={shared.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {running ? (
        <div className={styles.running}>
          {running.mode === "solo" ? (
            <p>
              Je spel loopt nog: <b>{running.state.timeline.length}</b> van {WINNING_CARDS} kaarten na{" "}
              {running.state.placed} nummers.
            </p>
          ) : (
            <p>Jullie spel samen loopt nog, met {running.state.seats.map((s) => s.name).join(", ")}.</p>
          )}
          <Link href={gamePath(running)} className={shared.cta}>
            Ga verder
          </Link>
          <input type="hidden" name="vervang" value="1" />
        </div>
      ) : null}

      <fieldset className={shared.fieldset}>
        <legend className={shared.section}>Variant</legend>
        <div className={shared.list}>
          {variants.map((v) => (
            <Choice key={v.id} name={v.name} hint={v.hint} checked={v.id === "original"} ready={v.ready} />
          ))}
        </div>
      </fieldset>

      <fieldset className={shared.fieldset}>
        <legend className={shared.section}>Spelers</legend>
        <div className={shared.list}>
          <Choice name="Solo" hint="Score = nummers tot 10 kaarten" checked ready />
          <Link href="/samen" className={`${shared.option} ${styles.link}`}>
            <span className={styles.radio} aria-hidden="true" />
            <span className={styles.choiceText}>
              <span className={shared.optionName}>Samen op één telefoon</span>
              <span className={styles.choiceHint}>2 tot 8 spelers, telefoon doorgeven</span>
            </span>
          </Link>
        </div>
      </fieldset>

      <EditionPicker editions={editions} allCount={allCount ?? 0} />
      <StartButton replaces={running !== null} disabled={!allCount} />
    </form>
  );
}

export default function GamePage({ searchParams }: PageProps<"/spel">) {
  return (
    <main className={shared.page}>
      <header className={shared.header}>
        <Link href="/" className={shared.back}>
          ← Terug
        </Link>
        <h1 className={shared.title}>Spel</h1>
        <p className={shared.hint}>Bouw een tijdlijn van 10 kaarten met zo min mogelijk nummers.</p>
      </header>
      <Suspense fallback={<div className={shared.placeholder} />}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
