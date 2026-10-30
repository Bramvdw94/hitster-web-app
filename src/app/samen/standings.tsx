import { WINNING_CARDS } from "@/lib/game/state";
import type { Seat } from "@/lib/game/together";
import styles from "./samen.module.css";

// Everyone's cards and tokens, in play order. `turn` marks whose turn it is.
export function Standings({ seats, turn, winner = null }: { seats: Seat[]; turn: number | null; winner?: number | null }) {
  return (
    <ol className={styles.standings} aria-label="Stand">
      {seats.map((seat, index) => (
        <li
          key={index}
          className={`${styles.standing} ${index === turn ? styles.now : ""} ${index === winner ? styles.winner : ""}`}
        >
          <span className={styles.standingName}>{seat.name}</span>
          <span className={styles.standingTokens} aria-label={`${seat.tokens} tokens`}>
            {Array.from({ length: seat.tokens }, (_, i) => (
              <span key={i} className={styles.token} aria-hidden="true" />
            ))}
          </span>
          <span className={styles.standingCards}>
            {seat.timeline.length}
            <small>/{WINNING_CARDS}</small>
          </span>
        </li>
      ))}
    </ol>
  );
}
