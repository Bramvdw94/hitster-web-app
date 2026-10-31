"use client";

import { useState } from "react";
import { writeZoekhulp } from "@/lib/zoekhulp/preference";
import shared from "@/app/oefenen/oefenen.module.css";
import styles from "./zoekhulp-toggle.module.css";

// The "Hulp" choice on the start screens. Not a form field: it is stored on this phone and
// read by the game screen, also when you continue a running game.
export function ZoekhulpToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <fieldset className={shared.fieldset}>
      <legend className={shared.section}>Hulp</legend>
      <div className={shared.list}>
        <label className={shared.option}>
          <input
            type="checkbox"
            checked={on}
            onChange={(event) => {
              setOn(event.target.checked);
              writeZoekhulp(event.target.checked);
            }}
          />
          <span className={shared.box} aria-hidden="true" />
          <span className={styles.text}>
            <span className={shared.optionName}>Zoekhulp</span>
            <span className={styles.hint}>Suggesties voor artiest en titel vanaf 3 letters</span>
          </span>
        </label>
      </div>
    </fieldset>
  );
}
