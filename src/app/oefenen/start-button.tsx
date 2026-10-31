"use client";

import styles from "./oefenen.module.css";

type Props = {
  label: string;
  // A round is still running: the new one replaces it, so ask first.
  replaces: boolean;
  disabled?: boolean;
  className?: string;
};

// A start button for the practice forms. With a round still running it asks before replacing it.
export function StartButton({ label, replaces, disabled, className = styles.cta }: Props) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (
          replaces &&
          !window.confirm("Je lopende ronde stopt. Wat je al beantwoordde, telt mee. Nieuwe ronde starten?")
        ) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
