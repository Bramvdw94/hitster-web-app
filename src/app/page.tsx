import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { logOut } from "./actions";
import styles from "./page.module.css";

const entries = [
  {
    title: "Spel",
    hint: "Speel Hitster zoals aan tafel, solo of samen.",
  },
  {
    title: "Oefenen",
    hint: "Raad jaar en artiest, je zwakke nummers komen vaker terug.",
  },
];

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
          {entries.map((entry) => (
            <li key={entry.title}>
              <button type="button" className={styles.entry} disabled>
                <span className={styles.entryText}>
                  <span className={styles.entryTitle}>{entry.title}</span>
                  <span className={styles.entryHint}>{entry.hint}</span>
                </span>
                <span className={styles.soon}>Binnenkort</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <p className={styles.footer}>Privé oefenapp, niet van Hitster of Jumbo.</p>
    </main>
  );
}
