// The ruler shows 1950–2025 (#6); the step buttons reach further for the odd older song.
export const RULER_START = 1950;
export const RULER_END = 2025;
export const YEAR_MIN = 1900;
export const YEAR_MAX = 2030;
export const DEFAULT_YEAR = 1988;

export function clampYear(year: number): number {
  return Math.min(Math.max(Math.round(year), YEAR_MIN), YEAR_MAX);
}

// Where the needle sits, 0 to 1. Years outside the ruler pin it to the edge.
export function needlePosition(year: number): number {
  return Math.min(Math.max((year - RULER_START) / (RULER_END - RULER_START), 0), 1);
}
