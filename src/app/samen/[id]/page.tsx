import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TimelineLadder } from "@/components/timeline-ladder/timeline-ladder";
import { loadGame, type Game } from "@/lib/game/games";
import { VARIANT_NAMES, WINNING_CARDS } from "@/lib/game/state";
import type { TogetherState } from "@/lib/game/together";
import { viewOf } from "@/lib/game/together-view";
import { createClient } from "@/lib/supabase/server";
import { canCorrectYears } from "@/lib/year-correction/actions";
import { Standings } from "../standings";
import { TogetherTurn } from "./together-turn";
import shared from "../../oefenen/oefenen.module.css";
import spel from "../../spel/spel.module.css";

export const metadata = { title: "Samen · Jaartal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The winner screen: everyone's card counts, most first, and the winner's timeline.
function Result({ game }: { game: Game<TogetherState> }) {
  const { seats, winner } = game.state;
  const ranked = seats
    .map((seat, index) => ({ seat, index }))
    .sort((a, b) => b.seat.timeline.length - a.seat.timeline.length);
  const champion = winner === null ? null : seats[winner];

  return (
    <>
      <section className={shared.total} aria-label="Uitslag">
        <p className={shared.section}>Samen · {VARIANT_NAMES[game.variant]}</p>
        {champion ? (
          <>
            <p className={spel.verdict}>{champion.name} wint!</p>
            <p className={shared.hint}>Als eerste {WINNING_CARDS} kaarten.</p>
          </>
        ) : (
          <>
            <p className={spel.verdict}>De stapel is op</p>
            <p className={shared.hint}>Niemand haalde {WINNING_CARDS} kaarten.</p>
          </>
        )}
      </section>

      <Standings seats={ranked.map((r) => r.seat)} turn={null} winner={ranked.findIndex((r) => r.index === winner)} />

      {champion ? (
        <section aria-label={`Tijdlijn van ${champion.name}`}>
          <h2 className={shared.section}>Tijdlijn van {champion.name}</h2>
          <TimelineLadder cards={champion.timeline.map((c) => ({ key: c.songId, ...c }))} />
        </section>
      ) : null}

      <div className={shared.actions}>
        <Link href="/samen" className={shared.cta}>
          Nog een spel
        </Link>
        <Link href="/" className={shared.secondary}>
          Naar home
        </Link>
      </div>
    </>
  );
}

async function GameView({ params }: { params: PageProps<"/samen/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const game = await loadGame<TogetherState>(supabase, id);
  if (!game) notFound();
  if (game.mode === "solo") redirect(`/spel/${id}`);
  // Replaced by a newer game.
  if (game.status === "abandoned") redirect("/samen");
  if (game.status === "finished") return <Result game={game} />;

  const view = await viewOf(supabase, game);
  if (view.over) notFound();
  return (
    <TogetherTurn key={view.moves} gameId={id} view={view} canCorrectYears={await canCorrectYears()} />
  );
}

export default function TogetherGamePage({ params }: PageProps<"/samen/[id]">) {
  return (
    <main className={shared.page}>
      <header className={shared.top}>
        <Link href="/" className={shared.back}>
          ← Home
        </Link>
        <h1 className={shared.topTitle}>Samen</h1>
      </header>
      <Suspense fallback={<div className={shared.placeholder} />}>
        <GameView params={params} />
      </Suspense>
    </main>
  );
}
