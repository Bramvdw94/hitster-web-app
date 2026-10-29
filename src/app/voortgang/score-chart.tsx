import { MAX_POINTS_PER_SONG, SESSION_SIZE } from "@/lib/practice/scoring";
import type { MyStats } from "@/lib/stats/stats";

const LEFT = 30;
const RIGHT = 350;
const TOP = 10;
const BOTTOM = 145;
const MAX_SESSION_POINTS = SESSION_SIZE * MAX_POINTS_PER_SONG;
const GRID = [0, 35, 70, MAX_SESSION_POINTS];

// Score per practice session, hand-drawn SVG: the last 20 finished sessions, 0 to 105.
export function ScoreChart({ sessions }: { sessions: MyStats["sessions"] }) {
  const step = sessions.length > 1 ? (RIGHT - LEFT) / (sessions.length - 1) : 0;
  const x = (i: number) => (sessions.length > 1 ? LEFT + i * step : (LEFT + RIGHT) / 2);
  const y = (v: number) => BOTTOM - (v / MAX_SESSION_POINTS) * (BOTTOM - TOP);
  const points = sessions.map((s, i) => `${x(i)},${y(s.points)}`).join(" ");
  const last = sessions.length - 1;
  const first = sessions[0];
  const latest = sessions[last];

  return (
    <svg
      viewBox="0 0 360 170"
      width="100%"
      role="img"
      aria-label={`Score per oefenronde, van ${first.points} in ronde ${first.number} naar ${latest.points} in ronde ${latest.number}, van de ${MAX_SESSION_POINTS} punten`}
    >
      {GRID.map((v) => (
        <g key={v}>
          <line x1={LEFT} x2={RIGHT} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
          <text x={LEFT - 6} y={y(v) + 4} textAnchor="end" fontSize={10} fill="var(--muted)">
            {v}
          </text>
        </g>
      ))}
      {sessions.length > 1 ? (
        <>
          <polygon
            points={`${x(0)},${BOTTOM} ${points} ${x(last)},${BOTTOM}`}
            fill="var(--accent)"
            fillOpacity={0.14}
          />
          <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        </>
      ) : null}
      <circle cx={x(last)} cy={y(latest.points)} r={5} fill="var(--accent)" stroke="var(--text)" strokeWidth={2} />
      <text
        x={x(last) - 8}
        y={y(latest.points) - 10}
        textAnchor="end"
        fontSize={12}
        fontWeight={700}
        fill="var(--text)"
      >
        {latest.points} punten
      </text>
      <text x={LEFT} y={164} fontSize={10} fill="var(--muted)">
        ronde {first.number}
      </text>
      {sessions.length > 1 ? (
        <text x={RIGHT} y={164} textAnchor="end" fontSize={10} fill="var(--muted)">
          ronde {latest.number}
        </text>
      ) : null}
    </svg>
  );
}
