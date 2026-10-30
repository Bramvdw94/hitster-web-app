import { describe, expect, it } from "vitest";
import { countdownText, daysUntilNewYearsEve, decadeLabel, percent, weakestDecade, yearsOffText } from "./stats";

describe("daysUntilNewYearsEve", () => {
  it("counts calendar days in Amsterdam", () => {
    expect(daysUntilNewYearsEve(new Date("2026-10-29T12:00:00Z"))).toBe(63);
    expect(daysUntilNewYearsEve(new Date("2026-12-31T12:00:00Z"))).toBe(0);
  });

  it("flips at midnight Amsterdam time, not UTC", () => {
    // 23:30 UTC on 30 December is already 31 December in Amsterdam.
    expect(daysUntilNewYearsEve(new Date("2026-12-30T22:59:00Z"))).toBe(1);
    expect(daysUntilNewYearsEve(new Date("2026-12-30T23:30:00Z"))).toBe(0);
  });

  it("looks ahead to this year's eve on 1 January", () => {
    expect(daysUntilNewYearsEve(new Date("2027-01-01T12:00:00Z"))).toBe(364);
  });
});

describe("countdownText", () => {
  it("says tonight, tomorrow or the days", () => {
    expect(countdownText(0)).toBe("Vanavond is het oudjaar");
    expect(countdownText(1)).toBe("Morgen is het oudjaar");
    expect(countdownText(63)).toBe("Oudjaar over 63 dagen");
  });
});

describe("percent", () => {
  it("rounds and is 0 for nothing", () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(0, 0)).toBe(0);
  });
});

describe("decadeLabel", () => {
  it("keeps two digits", () => {
    expect(decadeLabel(1980)).toBe("80s");
    expect(decadeLabel(2000)).toBe("00s");
    expect(decadeLabel(2010)).toBe("10s");
  });
});

describe("weakestDecade", () => {
  it("flags the lowest share close", () => {
    expect(
      weakestDecade([
        { decade: 1970, answered: 10, close: 5 },
        { decade: 1980, answered: 50, close: 20 },
        { decade: 1990, answered: 4, close: 3 },
      ]),
    ).toBe(1980);
  });

  it("flags nothing with fewer than two decades", () => {
    expect(weakestDecade([{ decade: 1980, answered: 3, close: 0 }])).toBeNull();
  });
});

describe("yearsOffText", () => {
  it("writes the average the Dutch way", () => {
    expect(yearsOffText(2.3)).toBe("gem. 2,3 jaar ernaast");
    expect(yearsOffText(1)).toBe("gem. 1 jaar ernaast");
    expect(yearsOffText(0)).toBe("gem. precies goed");
  });
});
