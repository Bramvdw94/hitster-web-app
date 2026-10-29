import Link from "next/link";
import { Suspense } from "react";
import { findActiveSessionId } from "@/lib/practice/session";
import { createClient } from "@/lib/supabase/server";
import { logOut } from "./actions";
import styles from "./page.module.css";


async function Player() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = data?.claims.sub;
  const { data: profile } = playerId
    ? await supabase.from("profiles").select("display_name").eq("id", playerId).maybeSingle()
    : { data: null };

  return (
    <div className={styles.player}>
      <p className={styles.playerName}>
        Hoi <strong>{profile?.display_name ?? "speler"}</strong>
      </p>
      <form action={logOut}>
        <button type="submit" className={styles.logout}>
          Uitloggen
        </button>
      </form>
    </div>
  );
}

// "Ga verder" when a practice session is still running, so reopening the app continues it.
async function PracticeBadge() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const playerId = data?.claims.sub;
  const activeId = playerId ? await findActiveSessionId(supabase, playerId) : null;
  return <span className={activeId ? styles.resume : styles.go}>{activeId ? "Ga verder" : "Start"}</span>;
}

export default function Home() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div className={styles.record} aria-hidden="true" />
        <div>
          <h1 className={styles.title}>Jaartal</h1>
          <p className={styles.tagline}>Oefenen voor Hitster</p>
        </div>
      </header>

      <Suspense fallback={<div className={styles.player} />}>
        <Player />
      </Suspense>

      <nav aria-label="Kies wat je wilt doen">
        <p className={styles.label}>Wat wil je doen?</p>
        <ul className={styles.menu}>
          <li>
            <button type="button" className={styles.entry} disabled>
              <span className={styles.entryText}>
                <span className={styles.entryTitle}>Spel</span>
                <span className={styles.entryHint}>Speel Hitster zoals aan tafel, solo of samen.</span>
              </span>
              <span className={styles.soon}>Binnenkort</span>
            </button>
          </li>
          <li>
            <Link href="/oefenen" className={styles.entry}>
              <span className={styles.entryText}>
                <span className={styles.entryTitle}>Oefenen</span>
                <span className={styles.entryHint}>Raad jaar en artiest van 15 nummers.</span>
              </span>
              <Suspense fallback={<span className={styles.go}>Start</span>}>
                <PracticeBadge />
              </Suspense>
            </Link>
          </li>
        </ul>
      </nav>

      <p className={styles.footer}>Privé oefenapp, niet van Hitster of Jumbo.</p>
    </main>
  );
}
