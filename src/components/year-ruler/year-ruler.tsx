"use client";

import { clampYear, needlePosition, RULER_END, RULER_START, YEAR_MAX, YEAR_MIN } from "./ruler";
import styles from "./year-ruler.module.css";

const LABELS = [1950, 1975, 2000, 2025];

// The tape-measure ruler from #6: drag along 1950–2025, or step a year with ‹ ›, which also
// reaches the few songs from before 1950.
export function YearRuler({ value, onChange }: { value: number; onChange: (year: number) => void }) {
  return (
    <div className={styles.ruler}>
      <div className={styles.readout}>
        <button
          type="button"
          className={styles.step}
          onClick={() => onChange(clampYear(value - 1))}
          disabled={value <= YEAR_MIN}
          aria-label="Een jaar eerder"
        >
          ‹
        </button>
        <output className={styles.year} aria-live="polite">
          {value}
        </output>
        <button
          type="button"
          className={styles.step}
          onClick={() => onChange(clampYear(value + 1))}
          disabled={value >= YEAR_MAX}
          aria-label="Een jaar later"
        >
          ›
        </button>
      </div>
      <div className={styles.tape}>
        <span className={styles.needle} style={{ left: `${needlePosition(value) * 100}%` }} aria-hidden="true" />
        <input
          type="range"
          min={RULER_START}
          max={RULER_END}
          step={1}
          value={Math.min(Math.max(value, RULER_START), RULER_END)}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label="Jaar"
          aria-valuetext={String(value)}
        />
        <div className={styles.labels} aria-hidden="true">
          {LABELS.map((year) => (
            <span key={year}>{year}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
