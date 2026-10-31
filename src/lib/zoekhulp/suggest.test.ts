import { describe, expect, it } from "vitest";
import { lettersToGo, prepare, suggest } from "./suggest";

const artists = prepare([
  "Dire Straits",
  "Dio",
  "Doe Maar",
  "Golden Earring",
  "BLØF",
  "Bløf",
  "The Police",
  "Marco Borsato",
  "Dolly Parton",
  "Within Temptation",
  "Vengaboys",
]);

describe("suggest", () => {
  it("shows nothing below three letters", () => {
    expect(suggest("di", artists)).toEqual([]);
    expect(suggest("", artists)).toEqual([]);
  });

  it("puts names that start with the input first", () => {
    expect(suggest("dir", artists)[0]).toBe("Dire Straits");
  });

  it("finds a later word", () => {
    expect(suggest("bors", artists)).toEqual(["Marco Borsato"]);
    expect(suggest("earr", artists)).toEqual(["Golden Earring"]);
  });

  it("ignores accents, case and a leading 'the'", () => {
    expect(suggest("blof", artists)).toEqual(["BLØF"]);
    expect(suggest("POLI", artists)).toEqual(["The Police"]);
  });

  it("tolerates a typo from four letters", () => {
    expect(suggest("dier", artists)).toContain("Dire Straits");
    expect(suggest("vemga", artists)).toContain("Vengaboys");
  });

  it("finds text inside a word", () => {
    expect(suggest("tempt", artists)).toEqual(["Within Temptation"]);
  });

  it("returns at most four", () => {
    const many = prepare(["Love 1", "Love 2", "Love 3", "Love 4", "Love 5"]);
    expect(suggest("lov", many)).toHaveLength(4);
  });
});

describe("lettersToGo", () => {
  it("counts down to three letters", () => {
    expect(lettersToGo("")).toBe(0);
    expect(lettersToGo("d")).toBe(2);
    expect(lettersToGo("di")).toBe(1);
    expect(lettersToGo("dir")).toBe(0);
  });
});
