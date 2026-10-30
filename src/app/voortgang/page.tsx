import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { WEAK_MAX_BOX } from "@/lib/practice/leitner";
import {
  countdownText,
  daysUntilNewYearsEve,
  decadeLabel,
  decadeTone,
  isEmpty,
  percent,
  weakestDecade,
  type MyStats,
} from "@/lib/stats/stats";
import { createClient } from "@/lib/supabase/server";
import { startPractice } from "../oefenen/actions";
import { ScoreChart } from "./score-chart";
import styles from "./voortgang.module.css";

export const metadata = { title: "Mijn voortgang · Jaartal" };

const number = new Intl.NumberFormat("nl-NL");

// Box 1-4 by colour from weak to nearly known, then box 5: known.
const BOX_COLOURS = ["var(--wrong)", "#ff9f6b", "var(--close)", "#b8f0a0", "var(--good)"];
const BOX_LABELS = ["Bak 1", "Bak 2", "Bak 3", "Bak 4", "Gekend"];

function Known({ stats, days }: { stats: MyStats; days: number }) {
  const heard = stats.boxes.reduce((sum, n) => sum + n, 0);
  const notHeard = Math.max(stats.totalSongs - heard, 0);
  const width = (n: number) => `${stats.totalSongs ? (n / stats.totalSongs) * 100 : 0}%`;
  return (
    <section className={styles.panel} aria-label="Gekend">
      <span className={styles.countdown}>{countdownText(days)}</span>
      <p className={styles.big}>
        {number.format(stats.boxes[4])} <small>/ {number.format(stats.totalSongs)} gekend</small>
      </p>
      <div className={styles.boxes} aria-hidden="true">
        {stats.boxes.map((n, i) => (
          <span key={i} style={{ width: width(n), background: BOX_COLOURS[i] }} />
        ))}
      </div>
      <ul className={styles.legend}>
        {stats.boxes.map((n, i) => (
          <li key={i}>
            <i style={{ background: BOX_COLOURS[i] }} />
            {BOX_LABELS[i]} · {number.format(n)}
          </li>
        ))}
        <li>
          <i style={{ background: "var(--line)" }} />
          Nog niet gehoord · {number.format(notHeard)}
        </li>
      </ul>
    </section>
  );
}

function Totals({ stats }: { stats: MyStats }) {
  return (
    <section className={styles.panel} aria-label="Totalen">
      <div className={styles.tiles}>
        <div className={styles.tile}>
          <b className={styles.accent}>{stats.streakDays}</b>
          <span>{stats.streakDays === 1 ? "dag" : "dagen"} op rij geoefend</span>
        </div>
        <div className={styles.tile}>
          <b>{stats.sessionsPlayed}</b>
          <span>{stats.sessionsPlayed === 1 ? "ronde" : "rondes"} gespeeld</span>
        </div>
        <div className={styles.tile}>
          <b>{percent(stats.artistCorrect, stats.answers)}%</b>
          <span>artiest goed</span>
        </div>
      </div>
    </section>
  );
}

function Decades({ decades }: { decades: MyStats["decades"] }) {
  const weakest = weakestDecade(decades);
  return (
    <section className={styles.panel} aria-label="Per decennium">
      <p className={styles.label}>Per decennium · binnen 1 jaar goed</p>
      <ul className={styles.rows}>
        {decades.map((d) => {
          const share = percent(d.close, d.answered);
          return (
            <li key={d.decade} className={styles.row}>
              <span className={styles.key}>{decadeLabel(d.decade)}</span>
              <span className={styles.bar}>
                <span className={styles[decadeTone(share)]} style={{ width: `${share}%` }} />
              </span>
              <span className={styles.value}>{share}%</span>
              {d.decade === weakest ? <span className={styles.flag}>Zwakst</span> : null}
            </li>
          );
        })}
      </ul>
      <p className={styles.foot}>Over je laatste 50 antwoorden per decennium.</p>
    </section>
  );
}

function Editions({ editions }: { editions: MyStats["editions"] }) {
  return (
    <section className={styles.panel} aria-label="Per editie">
      <p className={styles.label}>Per editie</p>
      <ul className={styles.list}>
        {editions.map((e) => (
          <li key={e.name} className={styles.item}>
            <span className={styles.name}>{e.name}</span>
            <span className={styles.count}>
              {number.format(e.known)} / {number.format(e.total)} gekend
            </span>
            <span className={styles.thinBar}>
              <span style={{ width: `${e.total ? (e.known / e.total) * 100 : 0}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const VARIANTS = [
  { key: "original", name: "Original" },
  { key: "pro", name: "Pro" },
  { key: "expert", name: "Expert" },
] as const;

// Personal best per variant: the fewest songs needed to reach 10 cards. Solo only.
function Solo({ solo }: { solo: MyStats["solo"] }) {
  return (
    <section className={styles.panel} aria-label="Spelmodus">
      <p className={styles.label}>Spelmodus solo · record</p>
      <ul className={styles.records}>
        {VARIANTS.map(({ key, name }) => {
          const record = solo.find((r) => r.variant === key);
          const games = record?.games ?? 0;
          return (
            <li key={key} className={record?.best ? styles.record : `${styles.record} ${styles.noRecord}`}>
              <span className={styles.variant}>{name}</span>
              <b>{record?.best ?? "–"}</b>
              <span>
                {games === 0
                  ? "nog niet gespeeld"
                  : `${record?.best ? "nummers tot 10 · " : ""}${games} ${games === 1 ? "potje" : "potjes"}`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Hardest({ songs, weakCount }: { songs: MyStats["hardest"]; weakCount: number }) {
  return (
    <section className={styles.panel} aria-label="Lastigste nummers">
      <p className={styles.label}>Lastigste nummers</p>
      {songs.length === 0 ? (
        <p className={styles.foot}>Geen nummers in bak 1. Mooi zo.</p>
      ) : (
        <ul className={styles.list}>
          {songs.map((s) => (
            <li key={s.id} className={styles.song}>
              {s.coverUrl ? (
                // Spotify's own cover, shown as ADR 0001 requires.
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.cover} src={s.coverUrl} alt="" width={44} height={44} />
              ) : (
                <span className={styles.cover} aria-hidden="true" />
              )}
              <span className={styles.songText}>
                <span className={styles.title}>{s.title}</span>
                <span className={styles.artist}>
                  {s.artists ?? "Onbekende artiest"} · <span className={styles.miss}>{s.wrong}× fout</span>
                </span>
              </span>
              <span className={styles.year}>{s.cardYear}</span>
            </li>
          ))}
        </ul>
      )}
      <form action={startPractice}>
        <input type="hidden" name="zwak" value="1" />
        <button type="submit" className={styles.cta} disabled={weakCount === 0}>
          Oefen mijn zwakke nummers
        </button>
      </form>
    </section>
  );
}

function Empty() {
  return (
    <section className={styles.panel}>
      <p className={styles.emptyTitle}>Nog niets te zien</p>
      <p className={styles.foot}>Speel een oefenronde, dan zie je hier hoe je ervoor staat.</p>
      <Link href="/oefenen" className={styles.cta}>
        Start je eerste ronde
      </Link>
    </section>
  );
}

async function Stats() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");

  const { data, error } = await supabase.rpc("get_my_stats");
  if (error) throw error;
  const stats = data as MyStats;
  const days = daysUntilNewYearsEve(new Date());
  if (isEmpty(stats)) {
    return (
      <>
        <section className={styles.panel} aria-label="Gekend">
          <span className={styles.countdown}>{countdownText(days)}</span>
        </section>
        <Empty />
      </>
    );
  }

  const weakCount = stats.boxes.slice(0, WEAK_MAX_BOX).reduce((sum, n) => sum + n, 0);
  return (
    <>
      <Known stats={stats} days={days} />
      <Totals stats={stats} />
      {stats.sessions.length > 0 ? (
        <section className={styles.panel} aria-label="Score per ronde">
          <p className={styles.label}>Score per oefenronde · laatste 20</p>
          <ScoreChart sessions={stats.sessions} />
        </section>
      ) : null}
      {stats.decades.length > 0 ? <Decades decades={stats.decades} /> : null}
      <Editions editions={stats.editions} />
      <Solo solo={stats.solo} />
      <Hardest songs={stats.hardest} weakCount={weakCount} />
    </>
  );
}

export default function ProgressPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Terug
        </Link>
        <h1 className={styles.heading}>Mijn voortgang</h1>
      </header>
      <Suspense fallback={<div className={styles.placeholder} />}>
        <Stats />
      </Suspense>
      <p className={styles.foot}>Alleen jij ziet deze cijfers.</p>
    </main>
  );
}
