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
