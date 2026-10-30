import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { TimelineLadder } from "@/components/timeline-ladder/timeline-ladder";
import { loadGame, personalBest, type Game } from "@/lib/game/games";
import { currentSong, isNewRecord, tokensOf, VARIANT_NAMES, WINNING_CARDS } from "@/lib/game/state";
import { trackIdOf } from "@/lib/practice/session";
import { createClient } from "@/lib/supabase/server";
import { canCorrectYears } from "@/lib/year-correction/actions";
import { startSoloGame } from "../actions";
import { SoloTurn } from "./solo-turn";
import shared from "../../oefenen/oefenen.module.css";
import styles from "../spel.module.css";

export const metadata = { title: "Spel · Jaartal" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function Result({ game }: { game: Game }) {
  const supabase = await createClient();
  const score = game.songs_needed;
  // The best before this game, so a reload still says whether it was a new record.
  const best =
    score === null || game.finished_at === null
      ? null
      : await personalBest(supabase, game.owner_id, game.variant, { gameId: game.id, finishedAt: game.finished_at });

  return (
    <>
      <section className={shared.total} aria-label="Score">
        <p className={shared.section}>Solo · {VARIANT_NAMES[game.variant]}</p>
        {score === null ? (
          <>
            <p className={styles.verdict}>De stapel is op</p>
            <p className={shared.hint}>
              {game.state.timeline.length} van {WINNING_CARDS} kaarten na {game.state.placed} nummers. Dit spel krijgt
              geen score.
            </p>
          </>
        ) : (
          <>
            <p className={shared.totalScore}>{score}</p>
            <p className={shared.hint}>nummers nodig voor {WINNING_CARDS} kaarten</p>
            {best === null ? (
              <p className={styles.record}>Je eerste score!</p>
            ) : isNewRecord(score, best) ? (
              <p className={styles.record}>Nieuw record! Vorige beste: {best}</p>
            ) : (
              <p className={shared.hint}>Je record: {best}</p>
            )}
          </>
        )}
      </section>

      <section aria-label="Jouw tijdlijn">
        <h2 className={shared.section}>Jouw tijdlijn</h2>
        <TimelineLadder cards={game.state.timeline.map((c) => ({ key: c.songId, ...c }))} />
      </section>

      <div className={shared.actions}>
        <form action={startSoloGame}>
          <input type="hidden" name="variant" value={game.variant} />
          {game.edition_ids.map((id) => (
            <input key={id} type="hidden" name="edition" value={id} />
          ))}
          <button type="submit" className={shared.cta}>
            Nog een spel
          </button>
        </form>
        <Link href="/" className={shared.secondary}>
          Naar home
        </Link>
      </div>
    </>
  );
}

async function GameView({ params }: { params: PageProps<"/spel/[id]">["params"] }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const game = await loadGame(supabase, id);
  if (!game) notFound();
  if (game.mode === "pass_and_play") redirect(`/samen/${id}`);
  // Replaced by a newer game.
  if (game.status === "abandoned") redirect("/spel");
  if (game.status === "finished") return <Result game={game} />;

  const songId = currentSong(game.state);
  if (songId === null) notFound();

  return (
    <SoloTurn
      key={game.state.placed}
      gameId={id}
      variant={game.variant}
      placed={game.state.placed}
      tokens={tokensOf(game.state)}
      timeline={game.state.timeline}
      trackId={await trackIdOf(supabase, songId)}
      canCorrectYears={await canCorrectYears()}
    />
  );
}

export default function GameViewPage({ params }: PageProps<"/spel/[id]">) {
  return (
    <main className={shared.page}>
      <header className={shared.top}>
        <Link href="/" className={shared.back}>
          ← Home
        </Link>
        <h1 className={shared.topTitle}>Spel</h1>
      </header>
      <Suspense fallback={<div className={shared.placeholder} />}>
        <GameView params={params} />
      </Suspense>
    </main>
  );
}
