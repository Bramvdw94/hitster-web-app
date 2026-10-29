"use server";

import { createClient } from "@/lib/supabase/server";
import {
  classifyYearCorrectionError,
  parseYearCorrection,
  yearCorrectionMessages,
} from "./year-correction";

export type YearCorrectionResult =
  | { ok: true; cardYear: number }
  | { ok: false; message: string };

// Saves Bram's year correction for a song. The database refuses anyone who isn't an admin,
// so this action doesn't check that itself. Attempts already scored keep their points.
export async function correctCardYear(
  songId: string,
  cardYear: string | number,
  note: string | null,
): Promise<YearCorrectionResult> {
  const parsed = parseYearCorrection(songId, cardYear, note);
  if (!parsed.ok) return { ok: false, message: yearCorrectionMessages[parsed.error] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("correct_card_year", {
      p_song_id: parsed.value.songId,
      p_card_year: parsed.value.cardYear,
      p_note: parsed.value.note,
    })
    .single<{ card_year: number }>();
  if (error) {
    return { ok: false, message: yearCorrectionMessages[classifyYearCorrectionError(error.code)] };
  }
  return { ok: true, cardYear: data.card_year };
}

// Whether the logged-in player may see the "Jaar klopt niet" link.
export async function canCorrectYears(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("is_admin");
  if (error) return false;
  return data === true;
}
