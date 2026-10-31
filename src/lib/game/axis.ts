// The year axis for the landscape game screen: the timeline drawn to scale, so an empty stretch
// of years is a wide stretch of line. Pure, so the screen only turns these numbers into pixels.

export type AxisRange = { start: number; end: number };

// From a round decade at or before the oldest card (1960 at the latest) to just after this
// year, so the gap "after the newest card" always has room to tap.
export function axisRange(years: number[], thisYear: number): AxisRange {
  const oldest = years.length > 0 ? Math.min(...years) : 1970;
  const newest = years.length > 0 ? Math.max(...years) : thisYear - 1;
  const start = Math.min(1960, Math.floor((oldest - 1) / 10) * 10);
  const end = Math.max(thisYear + 1, newest + 2);
  return { start, end };
}

// Where a year sits on the axis, from 0 (start) to 1 (end).
export function axisPosition(year: number, range: AxisRange): number {
  const span = range.end - range.start;
  if (span <= 0) return 0.5;
  return Math.min(1, Math.max(0, (year - range.start) / span));
}

// The decades to label on the axis.
export function decadeTicks(range: AxisRange): number[] {
  const ticks: number[] = [];
  for (let d = Math.ceil(range.start / 10) * 10; d <= range.end; d += 10) ticks.push(d);
  return ticks;
}

// The tappable stretch of line for each gap: from just after the card before it to just before
// the card after it (or the axis' ends), as fractions of the axis.
export function axisGaps(years: number[], range: AxisRange): { gap: number; from: number; to: number }[] {
  const pos = years.map((y) => axisPosition(y, range));
  return Array.from({ length: years.length + 1 }, (_, gap) => ({
    gap,
    from: gap === 0 ? 0 : pos[gap - 1],
    to: gap === years.length ? 1 : pos[gap],
  }));
}

// Which lane each card label goes in, so labels next to each other on the axis don't overlap.
// Lanes alternate above and below the line (0 above, 1 below, 2 further above, 3 further
// below). `xs` are the cards' positions in pixels, oldest first; `width` is a label's width.
export function assignLanes(xs: number[], width: number, lanes = 4): number[] {
  const lastEnd = Array.from({ length: lanes }, () => -Infinity);
  return xs.map((x, i) => {
    const left = x - width / 2;
    // Prefer the lane after the previous card's, so neighbours alternate above and below.
    const order = Array.from({ length: lanes }, (_, k) => k).sort((a, b) => {
      const pa = a === (i % 2) ? 0 : 1;
      const pb = b === (i % 2) ? 0 : 1;
      return pa - pb || a - b;
    });
    const free = order.find((lane) => lastEnd[lane] <= left);
    // Nothing free: the lane whose last label ends earliest overlaps the least.
    const lane = free ?? lastEnd.indexOf(Math.min(...lastEnd));
    lastEnd[lane] = x + width / 2;
    return lane;
  });
}
