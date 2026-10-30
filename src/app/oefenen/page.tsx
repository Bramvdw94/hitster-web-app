import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArtistSearch } from "@/components/artist-search/artist-search";
import { artistName, catalogueYears } from "@/lib/explore/explore";
import { decadesBetween, fromSearchParams } from "@/lib/practice/filter";
import { loadCandidates } from "@/lib/practice/progress";
import { SESSION_SIZE } from "@/lib/practice/scoring";
import { findActiveSessionId } from "@/lib/practice/session";
import { createClient } from "@/lib/supabase/server";
import { startPractice } from "./actions";
import { EditionPicker, type EditionOption } from "./edition-picker";
import { PeriodPicker } from "./period-picker";
import styles from "./oefenen.module.css";

export const metadata = { title: "Oefenen · Jaartal" };

const problems: Record<string, string> = {
  geen_nummers: "Er zijn geen speelbare nummers met deze keuze.",
  geen_zwakke: "Je hebt nu geen zwakke nummers.",
  starten: "De oefenronde kon niet starten. Probeer het nog eens.",
};

async function Setup({ searchParams }: { searchParams: PageProps<"/oefenen">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;
  // A running session comes first: reopening the app continues where you were.
  const activeId = playerId ? await findActiveSessionId(supabase, playerId) : null;
  if (activeId) redirect(`/oefenen/${activeId}`);

  const params = await searchParams;
  // Ontdek and a failed start link here with the filter filled in.
  const filter = fromSearchParams(params);
  const [{ data: editions, error }, { count: allCount, error: countError }, weakSongs, years, artist] = await Promise.all([
    supabase
      .from("edition_song_counts")
      .select("id, name, song_count")
      .order("is_expansion")
      .order("name")
      .returns<EditionOption[]>(),
    supabase.from("playable_songs").select("id", { count: "exact", head: true }),
    loadCandidates(supabase, [], true),
    catalogueYears(supabase),
    artistName(supabase, filter.artistId),
  ]);
  if (error) throw error;
  if (countError) throw countError;

  const { fout } = params;
  const problem = typeof fout === "string" ? problems[fout] : undefined;

  return (
    <>
      <form action={startPractice} className={styles.setup}>
        {problem ? (
          <p className={styles.problem} role="alert">
            {problem}
          </p>
        ) : null}
        <EditionPicker editions={editions} allCount={allCount ?? 0} />
        <div className={styles.filter}>
          <fieldset className={styles.fieldset}>
            <legend className={styles.section}>Artiest</legend>
            <ArtistSearch mode="field" initial={artist && filter.artistId ? { id: filter.artistId, name: artist } : null} />
          </fieldset>
          <PeriodPicker
            decades={decadesBetween(years.oldest, years.newest)}
            initialFrom={filter.yearFrom}
            initialTo={filter.yearTo}
          />
        </div>
        <button type="submit" className={styles.cta} disabled={!allCount}>
          Start oefenen
        </button>
      </form>
      <form action={startPractice} className={styles.weak}>
        <input type="hidden" name="zwak" value="1" />
        <button type="submit" className={styles.secondary} disabled={weakSongs.length === 0}>
          Oefen mijn zwakke nummers
        </button>
        <p className={styles.hint}>
          {weakSongs.length === 0
            ? "Nog geen zwakke nummers. Nummers die je mist, komen hier vanzelf."
            : `${Math.min(weakSongs.length, SESSION_SIZE)} nummers uit doos 1 en 2, uit alle edities.`}
        </p>
      </form>
    </>
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
          15 nummers. Raad het jaar en, als je het weet, de artiest. Kies je edities, en als je wilt
          een artiest of periode.
        </p>
      </header>
      <Suspense fallback={<div className={styles.placeholder} />}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
