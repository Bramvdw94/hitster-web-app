"use server";

import { stripTitleSuffixes } from "@/lib/matching/match";
import { createClient } from "@/lib/supabase/server";

export type SuggestionLists = { artists: string[]; titles: string[] };

const PAGE = 1000;

// Every artist name and song title in the whole catalogue (all editions, not just the chosen
// playlist), so the right answer sits between look-alikes. Read once per page visit.
export async function loadSuggestionLists(): Promise<SuggestionLists> {
  const supabase = await createClient();

  async function all(table: "artists" | "songs", column: "name" | "title"): Promise<string[]> {
    const names: string[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(table)
        .select(column)
        .order("id")
        .range(from, from + PAGE - 1)
        .returns<Record<string, string>[]>();
      if (error) throw error;
      names.push(...data.map((row) => row[column]));
      if (data.length < PAGE) return names;
    }
  }

  const [artists, titles] = await Promise.all([all("artists", "name"), all("songs", "title")]);
  return { artists, titles: titles.map(stripTitleSuffixes) };
}
