"use client";

import type { KeyboardEvent } from "react";
import { SuggestInput } from "@/components/suggest-input/suggest-input";
import { YearRuler } from "@/components/year-ruler/year-ruler";
import type { Variant } from "@/lib/game/state";
import styles from "./guess-card.module.css";

type Props = {
  // "card": the orange mystery card in the portrait ladder. "bar": one row under the year axis.
  layout: "card" | "bar";
  variant: Variant;
  song: number;
  where: string;
  artist: string;
  title: string;
  onArtist: (value: string) => void;
  onTitle: (value: string) => void;
  // Expert only: the guessed year.
  year: number | null;
  onYear: (year: number) => void;
  // False until the song has been started.
  ready: boolean;
  pending: boolean;
  onPlace: () => void;
  onClear: () => void;
  // Zoekhulp: suggestions from the catalogue while typing.
  hints: boolean;
};

const notes = {
  original: "Mag leeg. Artiest en titel goed is +1 token.",
  pro: "Artiest en titel goed om de kaart te houden. Typfouten mogen.",
  expert: "Artiest, titel en het exacte jaar goed om de kaart te houden.",
} as const;

// The orange card for the song you are placing (prototype "staand 7" and "liggend 13"): you
// name it where you put it. Enter in the title field places it.
export function GuessCard(props: Props) {
  const { layout, variant } = props;
  const placeholder = variant === "original" ? "mag leeg" : "typfouten mogen";

  function onTitleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (props.ready && !props.pending) props.onPlace();
  }

  function onArtistKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const next = event.currentTarget.form?.elements.namedItem("title");
    if (next instanceof HTMLInputElement) next.focus();
  }

  const disc = <span className={styles.disc} aria-hidden="true" />;
  const heading = (
    <span className={styles.heading}>
      <b>Nummer {props.song}</b>
      <span>{props.where}</span>
    </span>
  );
  // Portrait: the list spans both fields, below them. Landscape: it opens upward, so the
  // keyboard does not cover it.
  const suggestPlace =
    layout === "bar"
      ? ({ placement: "above", anchor: "self", wrapClassName: styles.barField } as const)
      : ({ placement: "below", anchor: "parent" } as const);
  const fields = (
    <>
      <SuggestInput
        kind="artist"
        enabled={props.hints}
        {...suggestPlace}
        name="artist"
        className={styles.input}
        value={props.artist}
        onValue={props.onArtist}
        onKeyDown={onArtistKey}
        aria-label="Artiest"
        placeholder={`Artiest (${placeholder})`}
        autoComplete="off"
        autoCapitalize="words"
        spellCheck={false}
        maxLength={200}
        enterKeyHint="next"
      />
      <SuggestInput
        kind="title"
        enabled={props.hints}
        {...suggestPlace}
        name="title"
        className={styles.input}
        value={props.title}
        onValue={props.onTitle}
        onKeyDown={onTitleKey}
        aria-label="Titel"
        placeholder={`Titel (${placeholder})`}
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        enterKeyHint="done"
      />
    </>
  );
  const place = (
    <button type="button" className={styles.place} onClick={props.onPlace} disabled={!props.ready || props.pending}>
      {props.ready ? "Plaats hier" : "Eerst play"}
    </button>
  );

  if (layout === "bar") {
    return (
      <form className={styles.bar} onSubmit={(event) => event.preventDefault()} aria-label="Dit nummer plaatsen">
        {disc}
        {heading}
        {fields}
        {props.year !== null ? (
          <input
            name="year"
            className={`${styles.input} ${styles.yearInput}`}
            value={props.year}
            onChange={(event) => {
              const year = Number(event.target.value.replace(/\D/g, "").slice(0, 4));
              props.onYear(year);
            }}
            aria-label="Jaar"
            inputMode="numeric"
            enterKeyHint="done"
          />
        ) : null}
        {place}
      </form>
    );
  }

  return (
    <form className={styles.card} onSubmit={(event) => event.preventDefault()} aria-label="Dit nummer plaatsen">
      <div className={styles.head}>
        {disc}
        {heading}
        <button type="button" className={styles.clear} onClick={props.onClear} aria-label="Ander gat kiezen">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className={styles.fields}>{fields}</div>
      {props.year !== null ? (
        <div className={styles.ruler}>
          <YearRuler value={props.year} onChange={props.onYear} />
        </div>
      ) : null}
      {place}
      <p className={styles.note}>{notes[variant]}</p>
    </form>
  );
}
