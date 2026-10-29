"use client";

import { useState } from "react";
import styles from "./oefenen.module.css";

export type EditionOption = { id: string; name: string; song_count: number };

// Tick editions, or "Alles". Nothing ticked means Alles, so the form never starts empty.
export function EditionPicker({ editions, allCount }: { editions: EditionOption[]; allCount: number }) {
  const [picked, setPicked] = useState<string[]>([]);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));
  }

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.section}>Edities</legend>
      <div className={styles.list}>
        <label className={styles.option}>
          <input type="checkbox" checked={picked.length === 0} onChange={() => setPicked([])} />
          <span className={styles.box} aria-hidden="true" />
          <span className={styles.optionName}>Alles</span>
          <span className={styles.count}>{allCount}</span>
        </label>
        {editions.map((edition) => (
          <label key={edition.id} className={styles.option}>
            <input
              type="checkbox"
              name="edition"
              value={edition.id}
              checked={picked.includes(edition.id)}
              onChange={() => toggle(edition.id)}
            />
            <span className={styles.box} aria-hidden="true" />
            <span className={styles.optionName}>{edition.name}</span>
            <span className={styles.count}>{edition.song_count}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
