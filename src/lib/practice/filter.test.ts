import { describe, expect, it } from "vitest";
import { decadesBetween, filterQuery, fromSearchParams, isFiltered, parseFilter, rangeLabel } from "./filter";

const ID = "a0000000-0000-0000-0000-000000000001";
const from = (fields: Record<string, string>) => parseFilter((name) => fields[name]);

describe("parseFilter", () => {
  it("reads artist and range", () => {
    expect(from({ artiest: ID, van: "1980", tot: "1985" })).toEqual({ artistId: ID, yearFrom: 1980, yearTo: 1985 });
  });

  it("drops garbage", () => {
    expect(from({ artiest: "queen", van: "19", tot: "abcd" })).toEqual({ artistId: null, yearFrom: null, yearTo: null });
    expect(from({ van: "1700" }).yearFrom).toBeNull();
  });

  it("turns a range typed the wrong way round", () => {
    expect(from({ van: "1990", tot: "1980" })).toMatchObject({ yearFrom: 1980, yearTo: 1990 });
  });

  it("expands a decade and a single year", () => {
    expect(from({ decennium: "1980" })).toMatchObject({ yearFrom: 1980, yearTo: 1989 });
    expect(from({ decennium: "1984" })).toMatchObject({ yearFrom: 1980, yearTo: 1989 });
    expect(from({ jaar: "1983" })).toMatchObject({ yearFrom: 1983, yearTo: 1983 });
  });

  it("allows an open range", () => {
    expect(from({ van: "1990" })).toMatchObject({ yearFrom: 1990, yearTo: null });
  });
});

describe("labels and links", () => {
  it("names the range", () => {
    expect(rangeLabel(from({ decennium: "1980" }))).toBe("80s");
    expect(rangeLabel(from({ decennium: "2000" }))).toBe("00s");
    expect(rangeLabel(from({ jaar: "1983" }))).toBe("1983");
    expect(rangeLabel(from({ van: "1983", tot: "1987" }))).toBe("1983–1987");
    expect(rangeLabel(from({ van: "1990" }))).toBe("vanaf 1990");
    expect(rangeLabel(from({ tot: "1970" }))).toBe("tot 1970");
    expect(rangeLabel(from({}))).toBeNull();
  });

  it("round-trips through the query string", () => {
    const filter = from({ artiest: ID, decennium: "1970" });
    expect(filterQuery(filter)).toBe(`?artiest=${ID}&van=1970&tot=1979`);
    expect(fromSearchParams(Object.fromEntries(new URLSearchParams(filterQuery(filter))))).toEqual(filter);
    expect(filterQuery(from({}))).toBe("");
    expect(isFiltered(from({}))).toBe(false);
  });

  it("lists every decade in the catalogue", () => {
    expect(decadesBetween(1958, 2023)).toEqual([1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]);
    expect(decadesBetween(null, null)).toEqual([]);
  });
});
