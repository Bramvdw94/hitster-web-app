"use client";

import { useEffect, useRef, useState } from "react";
import { assignLanes, axisGaps, axisPosition, axisRange, decadeTicks } from "@/lib/game/axis";
import { gapLabel } from "@/lib/game/placement";
import type { LadderCard } from "@/components/timeline-ladder/timeline-ladder";
import styles from "./year-axis.module.css";

type Props = {
  cards: LadderCard[];
  // With onSelect, the stretches of line between the cards can be tapped.
  selected?: number | null;
  onSelect?: (gap: number | null) => void;
  disabled?: boolean;
};

const LABEL_WIDTH = 88;
const thisYear = new Date().getFullYear();

// The timeline to scale, for a phone on its side (prototype "liggend 13"): one line from the
// 1960s to now, each card a small label above or below it, and the gaps as stretches of line.
// The chosen gap turns see-through orange.
export function YearAxis({ cards, selected = null, onSelect, disabled = false }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Gaps are between the cards that are really on the timeline, not the one being revealed.
  const placed = cards.filter((c) => !c.mark);
  const years = placed.map((c) => c.year);
  const range = axisRange(
    cards.map((c) => c.year),
    thisYear,
  );
  const pos = (year: number) => axisPosition(year, range);
  const lanes = assignLanes(
    cards.map((c) => pos(c.year) * width),
    LABEL_WIDTH + 6,
  );

  return (
    <div className={styles.axis} ref={box}>
      <div className={styles.line} aria-hidden="true" />
      {decadeTicks(range).map((decade) => (
        <span key={decade} className={styles.tick} style={{ left: `${pos(decade) * 100}%` }} aria-hidden="true">
          ’{String(decade).slice(2)}
        </span>
      ))}

      {onSelect
        ? axisGaps(years, range).map(({ gap, from, to }) => {
            const isSelected = selected === gap;
            return (
              <button
                key={`gap-${gap}`}
                type="button"
                className={`${styles.gap} ${isSelected ? styles.selected : ""}`}
                style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%` }}
                onClick={() => onSelect(isSelected ? null : gap)}
                aria-pressed={isSelected}
                aria-label={gapLabel(years, gap)}
                disabled={disabled}
              />
            );
          })
        : null}

      <ol className={styles.cards}>
        {cards.map((card, i) => (
          <li
            key={card.key}
            className={`${styles.card} ${styles[`lane${lanes[i]}`]} ${card.mark === "good" ? styles.good : ""} ${card.mark === "wrong" ? styles.wrong : ""}`}
            style={{ left: `${pos(card.year) * 100}%` }}
          >
            <span className={styles.year}>{card.year}</span>
            <b>{card.title}</b>
          </li>
        ))}
      </ol>
      {cards.map((card) => (
        <span
          key={`dot-${card.key}`}
          className={`${styles.dot} ${card.mark === "good" ? styles.good : ""} ${card.mark === "wrong" ? styles.wrong : ""}`}
          style={{ left: `${pos(card.year) * 100}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}
