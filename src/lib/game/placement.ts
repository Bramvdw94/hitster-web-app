// Placing a card on a timeline. Pure rules from #5 and GLOSSARY.md (placement): a card fits
// when its year lies between its neighbours, and equal years fit on either side.

// A gap is the position the card would take: 0 is before the oldest card, years.length after
// the newest. `years` is the timeline, oldest first.
export function fitsGap(years: number[], gap: number, year: number): boolean {
  if (!Number.isInteger(gap) || gap < 0 || gap > years.length) return false;
  const before = gap === 0 ? -Infinity : years[gap - 1];
  const after = gap === years.length ? Infinity : years[gap];
  return before <= year && year <= after;
}

// The words on a dashed gap in the timeline ladder.
export function gapLabel(years: number[], gap: number): string {
  if (years.length === 0) return "Hier";
  if (gap === 0) return `Voor ${years[0]}`;
  if (gap === years.length) return `Na ${years[years.length - 1]}`;
  return `Tussen ${years[gap - 1]} en ${years[gap]}`;
}
