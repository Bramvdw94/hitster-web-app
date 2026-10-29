import { describe, expect, it } from "vitest";
import { fitsGap, gapLabel } from "./placement";

const years = [1973, 1994, 2010];

describe("fitsGap", () => {
  it("accepts a year between its neighbours", () => {
    expect(fitsGap(years, 1, 1980)).toBe(true);
    expect(fitsGap(years, 2, 2001)).toBe(true);
  });

  it("rejects a year outside its neighbours", () => {
    expect(fitsGap(years, 1, 1970)).toBe(false);
    expect(fitsGap(years, 1, 1995)).toBe(false);
    expect(fitsGap(years, 2, 1980)).toBe(false);
  });

  it("accepts anything older at the front and anything newer at the end", () => {
    expect(fitsGap(years, 0, 1950)).toBe(true);
    expect(fitsGap(years, 0, 1980)).toBe(false);
    expect(fitsGap(years, 3, 2024)).toBe(true);
    expect(fitsGap(years, 3, 2005)).toBe(false);
  });

  it("lets an equal year fit on either side", () => {
    expect(fitsGap(years, 1, 1994)).toBe(true);
    expect(fitsGap(years, 2, 1994)).toBe(true);
    expect(fitsGap(years, 0, 1973)).toBe(true);
    expect(fitsGap(years, 1, 1973)).toBe(true);
    expect(fitsGap(years, 3, 2010)).toBe(true);
    expect(fitsGap(years, 2, 2010)).toBe(true);
  });

  it("handles runs of the same year", () => {
    const same = [1980, 1980, 1980];
    for (let gap = 0; gap <= same.length; gap++) expect(fitsGap(same, gap, 1980)).toBe(true);
    expect(fitsGap(same, 1, 1981)).toBe(false);
    expect(fitsGap(same, 3, 1981)).toBe(true);
  });

  it("fits any year next to a single starting card on the right side", () => {
    expect(fitsGap([1985], 0, 1960)).toBe(true);
    expect(fitsGap([1985], 1, 1960)).toBe(false);
    expect(fitsGap([1985], 1, 1999)).toBe(true);
  });

  it("rejects gaps that don't exist", () => {
    expect(fitsGap(years, -1, 1950)).toBe(false);
    expect(fitsGap(years, 4, 2024)).toBe(false);
    expect(fitsGap(years, 1.5, 1980)).toBe(false);
  });
});

describe("gapLabel", () => {
  it("names both ends and the gaps between", () => {
    expect(gapLabel(years, 0)).toBe("Voor 1973");
    expect(gapLabel(years, 1)).toBe("Tussen 1973 en 1994");
    expect(gapLabel(years, 3)).toBe("Na 2010");
  });
});
