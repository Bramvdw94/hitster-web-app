import { describe, expect, it } from "vitest";
import { clampYear, needlePosition } from "./ruler";

describe("year ruler", () => {
  it("puts the needle along 1950–2025 and pins it outside", () => {
    expect(needlePosition(1950)).toBe(0);
    expect(needlePosition(2025)).toBe(1);
    expect(needlePosition(1987.5)).toBe(0.5);
    expect(needlePosition(1930)).toBe(0);
    expect(needlePosition(2028)).toBe(1);
  });

  it("keeps years between 1900 and 2030", () => {
    expect(clampYear(1899)).toBe(1900);
    expect(clampYear(2031)).toBe(2030);
    expect(clampYear(1975)).toBe(1975);
  });
});
