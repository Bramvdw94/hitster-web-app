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
};

// The timeline ladder from #6: oldest at the top, a rail with dots, and dashed "Tussen 1973 en
// 1994" gaps; the tapped gap turns into the orange "Hier plaatsen" target.
export function TimelineLadder({ cards, selected = null, onSelect, disabled = false }: Props) {
  const years = cards.map((c) => c.year);

  function gap(index: number) {
    if (!onSelect) return null;
    const isSelected = selected === index;
    return (
      <li key={`gap-${index}`}>
        <button
          type="button"
          className={`${styles.gap} ${isSelected ? styles.selected : ""}`}
          onClick={() => onSelect(index)}
          aria-pressed={isSelected}
          disabled={disabled}
        >
          {isSelected ? "Hier plaatsen" : gapLabel(years, index)}
        </button>
      </li>
    );
  }

  return (
    <ol className={styles.ladder}>
      {cards.map((card, index) => [
        gap(index),
        <li
          key={card.key}
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
