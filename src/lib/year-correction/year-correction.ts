export const MIN_CARD_YEAR = 1800;
export const MAX_CARD_YEAR = 2100;
export const MAX_NOTE_LENGTH = 500;

export type YearCorrectionInput = {
  songId: string;
  cardYear: number;
  note: string | null;
};

export type YearCorrectionError = "geen-admin" | "ongeldig-jaar" | "onbekend-nummer" | "onbekend";

export const yearCorrectionMessages: Record<YearCorrectionError, string> = {
  "geen-admin": "Alleen Bram kan een jaar corrigeren.",
  "ongeldig-jaar": `Vul een jaar in tussen ${MIN_CARD_YEAR} en ${MAX_CARD_YEAR}.`,
  "onbekend-nummer": "Dit nummer staat niet in de catalogus.",
  onbekend: "Opslaan lukte niet. Probeer het nog een keer.",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Checks the sheet's fields before they reach the database, which checks them again.
export function parseYearCorrection(
  songId: unknown,
  cardYear: unknown,
  note: unknown,
): { ok: true; value: YearCorrectionInput } | { ok: false; error: YearCorrectionError } {
  if (typeof songId !== "string" || !UUID.test(songId)) {
    return { ok: false, error: "onbekend-nummer" };
  }

  const yearText = typeof cardYear === "number" ? String(cardYear) : typeof cardYear === "string" ? cardYear.trim() : "";
  if (!/^\d{4}$/.test(yearText)) {
    return { ok: false, error: "ongeldig-jaar" };
  }
  const year = Number(yearText);
  if (year < MIN_CARD_YEAR || year > MAX_CARD_YEAR) {
    return { ok: false, error: "ongeldig-jaar" };
  }

  const noteText = typeof note === "string" ? note.trim().slice(0, MAX_NOTE_LENGTH) : "";

  return { ok: true, value: { songId, cardYear: year, note: noteText === "" ? null : noteText } };
}

// correct_card_year() raises with these Postgres error codes.
export function classifyYearCorrectionError(code: string | undefined): YearCorrectionError {
  switch (code) {
    case "42501":
      return "geen-admin";
    case "22023":
      return "ongeldig-jaar";
    case "P0002":
      return "onbekend-nummer";
    default:
      return "onbekend";
  }
}
