import { describe, expect, it } from "vitest";
import { assignLanes, axisGaps, axisPosition, axisRange, decadeTicks } from "./axis";

describe("axisRange", () => {
  it("runs from 1960 to just after this year for a normal timeline", () => {
    expect(axisRange([1969, 1985, 2017], 2026)).toEqual({ start: 1960, end: 2027 });
  });

  it("starts at an earlier decade when a card is older than 1960", () => {
    expect(axisRange([1957, 1985], 2026)).toEqual({ start: 1950, end: 2027 });
    expect(axisRange([1950], 2026).start).toBe(1940);
  });

  it("leaves room after a card from this year", () => {
    expect(axisRange([2026], 2026).end).toBe(2028);
  });

  it("works for an empty timeline", () => {
    expect(axisRange([], 2026)).toEqual({ start: 1960, end: 2027 });
  });
});

describe("axisPosition", () => {
  const range = { start: 1960, end: 2020 };

  it("is a fraction of the range", () => {
    expect(axisPosition(1960, range)).toBe(0);
    expect(axisPosition(1990, range)).toBe(0.5);
    expect(axisPosition(2020, range)).toBe(1);
  });

  it("stays on the axis", () => {
    expect(axisPosition(1900, range)).toBe(0);
    expect(axisPosition(2100, range)).toBe(1);
  });
});

describe("decadeTicks", () => {
  it("lists the round decades inside the range", () => {
    expect(decadeTicks({ start: 1960, end: 2027 })).toEqual([1960, 1970, 1980, 1990, 2000, 2010, 2020]);
  });
});

describe("axisGaps", () => {
  it("gives one stretch per gap, from card to card", () => {
    const range = { start: 1960, end: 2020 };
    expect(axisGaps([1975, 2005], range)).toEqual([
      { gap: 0, from: 0, to: 0.25 },
      { gap: 1, from: 0.25, to: 0.75 },
      { gap: 2, from: 0.75, to: 1 },
    ]);
  });
});

describe("assignLanes", () => {
  it("alternates above and below when there is room", () => {
    expect(assignLanes([0, 100, 200, 300], 80)).toEqual([0, 1, 0, 1]);
  });

  it("moves a label to an outer lane when the near lane is taken", () => {
    // 0 and 30 alternate; 60 would hit 0's label in lane 0, so it goes further out.
    expect(assignLanes([0, 30, 60], 80)).toEqual([0, 1, 2]);
  });

  it("still gives every card a lane when all lanes are full", () => {
    const lanes = assignLanes([0, 10, 20, 30, 40], 80);
    expect(lanes).toHaveLength(5);
    for (const lane of lanes) expect(lane).toBeGreaterThanOrEqual(0);
  });
});
