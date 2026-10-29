import Link from "next/link";
import { TestPlayer } from "./test-player";
import styles from "./page.module.css";

export const metadata = { title: "Afspeeltest · Jaartal" };

export default function PlaybackTestPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Terug
        </Link>
        <h1 className={styles.title}>Afspeeltest</h1>
        <p className={styles.hint}>Tijdelijk: test of nummers afspelen op je telefoon. Je ziet niet welk nummer het is.</p>
      </header>
      <TestPlayer />
    </main>
  );
}
