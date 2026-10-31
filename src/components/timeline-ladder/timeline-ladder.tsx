import type { ReactNode } from "react";
import { gapLabel } from "@/lib/game/placement";
import styles from "./timeline-ladder.module.css";

export type LadderCard = {
  key: string;
  year: number;
  title: string;
  artist: string;
  // The card just placed: green when right, red when it is about to be discarded.
  mark?: "good" | "wrong";
};

type Props = {
  cards: LadderCard[];
  // With onSelect, the dashed gaps between the cards can be tapped.
  selected?: number | null;
  onSelect?: (gap: number) => void;
  disabled?: boolean;
  // Gaps someone already picked, with their name: shown, but not tappable (a steal in #29).
  taken?: Record<number, string>;
  // One line per card, so a whole timeline fits on a phone screen.
  compact?: boolean;
  // Shown in the selected gap instead of the orange "Hier plaatsen" target: the mystery card.
  selectedContent?: ReactNode;
};

// The timeline ladder from #6: oldest at the top, a rail with dots, and dashed "Tussen 1973 en
// 1994" gaps; the tapped gap turns into the orange "Hier plaatsen" target.
export function TimelineLadder({
  cards,
  selected = null,
  onSelect,
  disabled = false,
  taken = {},
  compact = false,
  selectedContent,
}: Props) {
  const years = cards.map((c) => c.year);

  function gap(index: number) {
    const takenBy = taken[index];
    if (takenBy !== undefined) {
      return (
        <li key={`gap-${index}`}>
          <span className={`${styles.gap} ${styles.taken}`}>
            {takenBy} · {gapLabel(years, index)}
          </span>
        </li>
      );
    }
    if (!onSelect) return null;
    const isSelected = selected === index;
    if (isSelected && selectedContent) {
      return (
        <li key={`gap-${index}`} className={styles.mystery}>
          {selectedContent}
        </li>
      );
    }
    return (
      <li key={`gap-${index}`}>
        <button
          type="button"
          className={`${styles.gap} ${isSelected ? styles.selected : ""}`}
          onClick={() => onSelect(index)}
          aria-pressed={isSelected}
          aria-label={isSelected ? `Hier plaatsen, ${gapLabel(years, index).toLowerCase()}` : gapLabel(years, index)}
          disabled={disabled}
        >
          {isSelected ? "Hier plaatsen" : gapLabel(years, index)}
        </button>
      </li>
    );
  }

  return (
    <ol className={`${styles.ladder} ${compact ? styles.compact : ""}`}>
      {cards.map((card, index) => [
        gap(index),
        <li
          key={card.key}
          data-mark={card.mark}
          className={`${styles.card} ${card.mark === "good" ? styles.good : ""} ${card.mark === "wrong" ? styles.wrong : ""}`}
        >
          <span className={styles.year}>{card.year}</span>
          <span className={styles.text}>
            <b>{card.title}</b>
            <span>{card.artist}</span>
          </span>
        </li>,
      ])}
      {gap(cards.length)}
    </ol>
  );
}
