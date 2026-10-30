"use client";

import { useState } from "react";
import type { Variant } from "@/lib/game/together";
import shared from "../oefenen/oefenen.module.css";
import spel from "../spel/spel.module.css";

const variants: { id: Variant; name: string; hint: string }[] = [
  { id: "original", name: "Original", hint: "Alleen de plek op de tijdlijn" },
  { id: "pro", name: "Pro", hint: "Plus artiest en titel" },
  { id: "expert", name: "Expert", hint: "Plus het exacte jaar" },
];

export function VariantPicker() {
  const [picked, setPicked] = useState<Variant>("original");
  return (
    <fieldset className={shared.fieldset}>
      <legend className={shared.section}>Variant</legend>
      <div className={shared.list}>
        {variants.map((v) => (
          <label key={v.id} className={shared.option}>
            <input
              type="radio"
              name="variant"
              value={v.id}
              checked={picked === v.id}
              onChange={() => setPicked(v.id)}
            />
            <span className={spel.radio} aria-hidden="true" />
            <span className={spel.choiceText}>
              <span className={shared.optionName}>{v.name}</span>
              <span className={spel.choiceHint}>{v.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
