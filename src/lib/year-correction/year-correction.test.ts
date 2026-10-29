import { describe, expect, it } from "vitest";
import { classifyYearCorrectionError, parseYearCorrection } from "./year-correction";

const songId = "0b9c1e2a-3f4d-4a5b-8c6d-7e8f9a0b1c2d";

describe("parseYearCorrection", () => {
  it("accepts a year typed in the sheet", () => {
    expect(parseYearCorrection(songId, " 1984 ", "Kaart zegt 1984")).toEqual({
      ok: true,
      value: { songId, cardYear: 1984, note: "Kaart zegt 1984" },
    });
  });

  it("accepts a year as a number", () => {
    expect(parseYearCorrection(songId, 1969, null)).toMatchObject({ ok: true, value: { cardYear: 1969 } });
  });

  it("stores an empty note as no note", () => {
    expect(parseYearCorrection(songId, "2001", "   ")).toMatchObject({ ok: true, value: { note: null } });
    expect(parseYearCorrection(songId, "2001", undefined)).toMatchObject({ ok: true, value: { note: null } });
  });

  it("cuts a very long note", () => {
    const result = parseYearCorrection(songId, "2001", "x".repeat(600));
    expect(result.ok && result.value.note?.length).toBe(500);
  });

  it("rejects years that are not four digits or out of range", () => {
    for (const year of ["", "84", "19845", "19x4", "1799", "2101", 1984.5, null]) {
      expect(parseYearCorrection(songId, year, null)).toEqual({ ok: false, error: "ongeldig-jaar" });
    }
  });

  it("rejects a song id that is not a uuid", () => {
    expect(parseYearCorrection("abc", "1984", null)).toEqual({ ok: false, error: "onbekend-nummer" });
    expect(parseYearCorrection(undefined, "1984", null)).toEqual({ ok: false, error: "onbekend-nummer" });
  });
});

describe("classifyYearCorrectionError", () => {
  it("maps the database's error codes", () => {
    expect(classifyYearCorrectionError("42501")).toBe("geen-admin");
    expect(classifyYearCorrectionError("22023")).toBe("ongeldig-jaar");
    expect(classifyYearCorrectionError("P0002")).toBe("onbekend-nummer");
    expect(classifyYearCorrectionError("08006")).toBe("onbekend");
    expect(classifyYearCorrectionError(undefined)).toBe("onbekend");
  });
});
