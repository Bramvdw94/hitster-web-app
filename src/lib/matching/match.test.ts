import { describe, expect, it } from "vitest";
import { type CreditedArtist, matchArtist, matchTitle, normalise, similarity } from "./match";

const person = (name: string, aliases: string[] = []): CreditedArtist => ({
  name,
  kind: "person",
  aliases,
});
const group = (name: string, aliases: string[] = []): CreditedArtist => ({
  name,
  kind: "group",
  aliases,
});

describe("normalise", () => {
  it.each([
    ["Beyoncé", "beyonce"],
    ["BLØF", "blof"],
    ["Die Ärzte", "die arzte"],
    ["Straße", "strasse"],
    ["Simon & Garfunkel", "simon and garfunkel"],
    ["Simon en Garfunkel", "simon and garfunkel"],
    ["Guns N' Roses", "guns n roses"],
    ["AC/DC", "ac dc"],
    ["The Beatles", "beatles"],
    ["De Dijk", "dijk"],
    ["Het Goede Doel", "goede doel"],
  ])("%s → %s", (input, expected) => {
    expect(normalise(input)).toBe(expected);
  });
});

describe("similarity", () => {
  it("ignores spaces", () => {
    expect(similarity("doemaar", "doe maar")).toBe(1);
  });

  it("counts an adjacent swap as one edit", () => {
    expect(similarity("beyocne", "beyonce")).toBeCloseTo(1 - 1 / 7);
  });
});

describe("matchArtist", () => {
  describe("calibration cases from #4 that pass", () => {
    it.each<[string, CreditedArtist[]]>([
      ["beyonse", [person("Beyoncé")]],
      ["beyocne", [person("Beyoncé")]],
      ["david bowy", [group("Queen"), person("David Bowie")]],
      ["queen and david bowie", [group("Queen"), person("David Bowie")]],
      ["guus mewis", [person("Guus Meeuwis")]],
      ["anuk", [person("Anouk")]],
      ["blof", [group("BLØF")]],
      ["doemaar", [group("Doe Maar")]],
      ["acdc", [group("AC/DC")]],
      ["aha", [group("a-ha")]],
      ["marco borsatto", [person("Marco Borsato")]],
      ["the beetles", [group("The Beatles")]],
      ["earth, wind and fire", [group("Earth, Wind & Fire")]],
    ])("%s", (guess, artists) => {
      expect(matchArtist(guess, artists)).toBe(true);
    });
  });

  describe("calibration cases from #4 that fail", () => {
    it.each<[string, CreditedArtist[]]>([
      ["madness", [person("Madonna")]],
      ["aqua", [group("ABBA")]],
      ["toto", [group("Tool")]],
      ["marco", [person("Marco Borsato")]],
      ["bloem", [group("BLØF")]],
      ["simon", [group("Simon & Garfunkel")]],
    ])("%s", (guess, artists) => {
      expect(matchArtist(guess, artists)).toBe(false);
    });
  });

  describe("rules from #7", () => {
    it("accepts a surname for a person", () => {
      expect(matchArtist("Hazes", [person("André Hazes")])).toBe(true);
    });

    it("ignores Jr. when taking the surname", () => {
      expect(matchArtist("hazes", [person("André Hazes Jr.")])).toBe(true);
    });

    it("rejects a surname-like word for a group", () => {
      expect(matchArtist("Maar", [group("Doe Maar")])).toBe(false);
      expect(matchArtist("Garfunkel", [group("Simon & Garfunkel")])).toBe(false);
    });

    it("accepts an extra wrong artist when one credited artist matches", () => {
      expect(matchArtist("Doe Maar en Rob de Nijs", [group("Doe Maar")])).toBe(true);
      expect(matchArtist("queen feat. madonna", [group("Queen"), person("David Bowie")])).toBe(
        true,
      );
    });

    it("rejects empty input", () => {
      expect(matchArtist("", [person("Anouk")])).toBe(false);
      expect(matchArtist("  ,  ", [person("Anouk")])).toBe(false);
    });
  });

  it("matches an alias", () => {
    expect(matchArtist("gnr", [group("Guns N' Roses", ["GNR"])])).toBe(true);
  });
});

describe("matchTitle", () => {
  it.each([
    ["Bohemian Rhapsody - Remastered 2011", "bohemian rhapsody"],
    ["Bohemian Rhapsody - 2011 Remaster", "bohemian rhapsody"],
    ["Heroes (2017 Remaster)", "heroes"],
    ["Zij Gelooft In Mij - Radio Edit", "zij gelooft in mij"],
    ["Under Pressure (feat. David Bowie)", "under pressure"],
    ["Pa - Remastered", "pa"],
  ])("strips the suffix from %s", (title, guess) => {
    expect(matchTitle(guess, title)).toBe(true);
  });

  it("tolerates a typo", () => {
    expect(matchTitle("bohemian rapsody", "Bohemian Rhapsody")).toBe(true);
  });

  it("rejects a different title", () => {
    expect(matchTitle("under preasure", "Bohemian Rhapsody")).toBe(false);
    expect(matchTitle("titanium", "Titanic")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(matchTitle("", "Heroes")).toBe(false);
  });
});
