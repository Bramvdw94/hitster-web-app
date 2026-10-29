"use client";

import { useRef, useState, useTransition } from "react";
import { correctCardYear } from "@/lib/year-correction/actions";
import styles from "./year-correction.module.css";

type Props = {
  songId: string;
  cardYear: number;
};

// Bram's "Jaar klopt niet" link on the answer screen: a sheet that saves the year from his
// physical card. It counts from the next time the song comes up; this answer keeps its points.
export function YearCorrection({ songId, cardYear }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [year, setYear] = useState(String(cardYear));
  const [note, setNote] = useState("");
  const [savedYear, setSavedYear] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function open() {
    setProblem(null);
    dialog.current?.showModal();
  }

  function save() {
    setProblem(null);
    startTransition(async () => {
      const result = await correctCardYear(songId, year, note);
      if (!result.ok) {
        setProblem(result.message);
        return;
      }
      setSavedYear(result.cardYear);
      dialog.current?.close();
    });
  }

  return (
    <>
      {savedYear !== null ? (
        <p className={styles.saved} role="status">
          Opgeslagen: telt voortaan als {savedYear}.{" "}
          <button type="button" className={styles.link} onClick={open}>
            Aanpassen
          </button>
        </p>
      ) : (
        <button type="button" className={styles.link} onClick={open}>
          Jaar klopt niet
        </button>
      )}

      <dialog ref={dialog} className={styles.sheet} aria-labelledby="year-correction-title">
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <h2 id="year-correction-title" className={styles.title}>
            Jaar klopt niet
          </h2>
          <p className={styles.current}>
            Nu op de kaart: <b>{savedYear ?? cardYear}</b>
          </p>

          <div className={styles.field}>
            <label htmlFor="year-correction-year">Jaar op je kaart</label>
            <input
              id="year-correction-year"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              required
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="year-correction-note">Notitie</label>
            <input
              id="year-correction-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={500}
              autoComplete="off"
              placeholder="Mag leeg"
            />
          </div>

          {problem ? (
            <p className={styles.problem} role="alert">
              {problem}
            </p>
          ) : null}

          <p className={styles.hint}>Telt vanaf de volgende keer, voor iedereen. Dit antwoord houdt zijn punten.</p>

          <div className={styles.actions}>
            <button type="submit" className={styles.save} disabled={pending}>
              {pending ? "Opslaan…" : "Opslaan"}
            </button>
            <button type="button" className={styles.cancel} onClick={() => dialog.current?.close()}>
              Annuleren
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
