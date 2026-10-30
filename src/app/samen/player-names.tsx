"use client";

import { useState } from "react";
import { MAX_NAME_LENGTH, MAX_PLAYERS, MIN_PLAYERS } from "@/lib/game/together";
import shared from "../oefenen/oefenen.module.css";
import styles from "./samen.module.css";

// 2 to 8 names in turn order. The logged-in player is prefilled as the first.
export function PlayerNames({ first }: { first: string }) {
  const [names, setNames] = useState([first, ""]);

  function set(index: number, value: string) {
    setNames((current) => current.map((n, i) => (i === index ? value : n)));
  }

  return (
    <fieldset className={shared.fieldset}>
      <legend className={shared.section}>Spelers, in speelvolgorde</legend>
      <ol className={styles.names}>
        {names.map((name, index) => (
          <li key={index} className={`${shared.field} ${styles.name}`}>
            <label htmlFor={`speler-${index}`}>Speler {index + 1}</label>
            <div className={styles.nameRow}>
              <input
                id={`speler-${index}`}
                name="speler"
                value={name}
                onChange={(event) => set(index, event.target.value)}
                maxLength={MAX_NAME_LENGTH}
                placeholder="Naam"
                autoComplete="off"
                required={index < MIN_PLAYERS}
              />
              {names.length > MIN_PLAYERS ? (
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => setNames((current) => current.filter((_, i) => i !== index))}
                  aria-label={`Speler ${index + 1} weghalen`}
                >
                  ×
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {names.length < MAX_PLAYERS ? (
        <button type="button" className={shared.secondary} onClick={() => setNames((current) => [...current, ""])}>
          + Speler
        </button>
      ) : null}
    </fieldset>
  );
}
