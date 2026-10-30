"use client";

import { useState } from "react";
import styles from "./oefenen.module.css";

type Props = {
  // Every decade in the catalogue, e.g. [1950, 1960, ...].
  decades: number[];
  initialFrom: number | null;
  initialTo: number | null;
};

type Choice = { kind: "all" } | { kind: "decade"; decade: number } | { kind: "own" };

function initialChoice(decades: number[], from: number | null, to: number | null): Choice {
  if (from === null && to === null) return { kind: "all" };
  if (from !== null && to === from + 9 && decades.includes(from)) return { kind: "decade", decade: from };
  return { kind: "own" };
}

// "Alle jaren", one decade, or an own range. Sends `van` and `tot` with the form.
export function PeriodPicker({ decades, initialFrom, initialTo }: Props) {
  const [choice, setChoice] = useState<Choice>(() => initialChoice(decades, initialFrom, initialTo));
  const chip = (active: boolean) => (active ? `${styles.chip} ${styles.chipOn}` : styles.chip);

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.section}>Periode</legend>
      <div className={styles.chips}>
        <button type="button" className={chip(choice.kind === "all")} onClick={() => setChoice({ kind: "all" })}>
          Alle jaren
        </button>
        {decades.map((d) => (
          <button
            key={d}
            type="button"
            className={chip(choice.kind === "decade" && choice.decade === d)}
            onClick={() => setChoice({ kind: "decade", decade: d })}
          >
            {String(d % 100).padStart(2, "0")}s
          </button>
        ))}
        <button type="button" className={chip(choice.kind === "own")} onClick={() => setChoice({ kind: "own" })}>
          Eigen
        </button>
      </div>
      {choice.kind === "decade" ? (
        <>
          <input type="hidden" name="van" value={choice.decade} />
          <input type="hidden" name="tot" value={choice.decade + 9} />
        </>
      ) : null}
      {choice.kind === "own" ? (
        <div className={styles.range}>
          <label>
            <span>Van</span>
            <input
              type="number"
              name="van"
              inputMode="numeric"
              min={1800}
              max={2100}
              placeholder="1975"
              defaultValue={initialFrom ?? undefined}
            />
          </label>
          <label>
            <span>Tot en met</span>
            <input
              type="number"
              name="tot"
              inputMode="numeric"
              min={1800}
              max={2100}
              placeholder="1985"
              defaultValue={initialTo ?? undefined}
            />
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
