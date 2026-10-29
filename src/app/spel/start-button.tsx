"use client";

import styles from "../oefenen/oefenen.module.css";

// "Start spel". With a game still running it asks first, since the new game replaces it.
export function StartButton({ replaces, disabled }: { replaces: boolean; disabled: boolean }) {
  return (
    <button
      type="submit"
      className={styles.cta}
      disabled={disabled}
      onClick={(event) => {
        if (replaces && !window.confirm("Je lopende spel stopt en telt niet mee. Nieuw spel starten?")) {
          event.preventDefault();
        }
      }}
    >
      {replaces ? "Nieuw spel" : "Start spel"}
    </button>
  );
}
