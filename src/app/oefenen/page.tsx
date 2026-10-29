import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { findActiveSessionId } from "@/lib/practice/session";
import { createClient } from "@/lib/supabase/server";
import { startPractice } from "./actions";
import { EditionPicker, type EditionOption } from "./edition-picker";
import styles from "./oefenen.module.css";

export const metadata = { title: "Oefenen · Jaartal" };

const problems: Record<string, string> = {
  geen_nummers: "Er zijn geen speelbare nummers in deze edities.",
  starten: "De oefenronde kon niet starten. Probeer het nog eens.",
};

async function Setup({ searchParams }: { searchParams: PageProps<"/oefenen">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  // A running session comes first: reopening the app continues where you were.
  const activeId = playerId ? await findActiveSessionId(supabase, playerId) : null;
  if (activeId) redirect(`/oefenen/${activeId}`);

  const [{ data: editions, error }, { count: allCount, error: countError }] = await Promise.all([
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
    <form action={startPractice} className={styles.setup}>
      {problem ? (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      ) : null}
      <EditionPicker editions={editions} allCount={allCount ?? 0} />
      <button type="submit" className={styles.cta} disabled={!allCount}>
        Start oefenen
      </button>
    </form>
  );
}

export default function PracticePage({ searchParams }: PageProps<"/oefenen">) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Terug
        </Link>
        <h1 className={styles.title}>Oefenen</h1>
        <p className={styles.hint}>
          15 nummers. Raad het jaar en, als je het weet, de artiest. Kies je edities.
        </p>
      </header>
      <Suspense fallback={<div className={styles.placeholder} />}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
