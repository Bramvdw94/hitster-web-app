import Link from "next/link";
import { Suspense } from "react";
import { PlaybackSuggestion } from "@/components/device-picker/playback-suggestion";
import { findActiveGame, gamePath } from "@/lib/game/games";
import { MAX_NAME_LENGTH } from "@/lib/game/together";
import { createClient } from "@/lib/supabase/server";
import { EditionPicker, type EditionOption } from "../oefenen/edition-picker";
import shared from "../oefenen/oefenen.module.css";
import { StartButton } from "../spel/start-button";
import spel from "../spel/spel.module.css";
import { startTogetherGame } from "./actions";
import { PlayerNames } from "./player-names";
import { VariantPicker } from "./variant-picker";

export const metadata = { title: "Samen · Jaartal" };

const problems: Record<string, string> = {
  spelers: "Vul 2 tot 8 namen in.",
  geen_nummers: "Er zijn te weinig speelbare nummers in deze edities.",
  starten: "Het spel kon niet starten. Probeer het nog eens.",
};

async function Setup({ searchParams }: { searchParams: PageProps<"/samen">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const playerId = claims?.claims.sub;

  const [running, profile, { data: editions, error }, { count: allCount, error: countError }] = await Promise.all([
    playerId ? findActiveGame(supabase, playerId) : null,
    playerId
      ? supabase.from("profiles").select("display_name").eq("id", playerId).maybeSingle<{ display_name: string | null }>()
      : null,
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
    <form action={startTogetherGame} className={shared.setup}>
      {problem ? (
        <p className={shared.problem} role="alert">
          {problem}
        </p>
      ) : null}

      {running ? (
        <div className={spel.running}>
          {running.mode === "pass_and_play" ? (
            <p>Jullie spel loopt nog, met {running.state.seats.map((s) => s.name).join(", ")}.</p>
          ) : (
            <p>Je solospel loopt nog. Een spel samen vervangt het.</p>
          )}
          <Link href={gamePath(running)} className={shared.cta}>
            Ga verder
          </Link>
          <input type="hidden" name="vervang" value="1" />
        </div>
      ) : null}

      <PlayerNames first={(profile?.data?.display_name ?? "").slice(0, MAX_NAME_LENGTH)} />
      <VariantPicker />
      <EditionPicker editions={editions} allCount={allCount ?? 0} />
      <PlaybackSuggestion />
      <StartButton replaces={running !== null} disabled={!allCount} />
    </form>
  );
}

export default function TogetherPage({ searchParams }: PageProps<"/samen">) {
  return (
    <main className={shared.page}>
      <header className={shared.header}>
        <Link href="/spel" className={shared.back}>
          ← Spel
        </Link>
        <h1 className={shared.title}>Samen</h1>
        <p className={shared.hint}>
          2 tot 8 spelers op één telefoon. Wie het eerst 10 kaarten heeft, wint. Telt niet mee voor je zwakke nummers.
        </p>
      </header>
      <Suspense fallback={<div className={shared.placeholder} />}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
