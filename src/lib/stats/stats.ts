// "Mijn voortgang" (#30): the shape get_my_stats() returns and the small sums the screen does
// on top of it. Pure, so it is tested without a database.

export type MyStats = {
  totalSongs: number;
  // Songs per Leitner box 1-5; box 5 is known.
  boxes: [number, number, number, number, number];
  streakDays: number;
  sessionsPlayed: number;
  answers: number;
  artistCorrect: number;
  // The last 20 finished practice sessions, oldest first.
  sessions: { number: number; points: number }[];
  // At most 1 year off, over the last 50 answers per decade.
  decades: { decade: number; answered: number; close: number }[];
  editions: { name: string; known: number; total: number }[];
  hardest: {
    id: string;
    title: string;
    artists: string | null;
    cardYear: number;
    coverUrl: string | null;
    wrong: number;
  }[];
};

const TIME_ZONE = "Europe/Amsterdam";

// The calendar date in Amsterdam, as days since 1970, so the countdown flips at local midnight.
function amsterdamDay(at: Date): { year: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  return { year, day: Date.UTC(year, get("month") - 1, get("day")) / 86_400_000 };
}

// Days until 31 December in Amsterdam; 0 on the day itself.
export function daysUntilNewYearsEve(now: Date): number {
  const { year, day } = amsterdamDay(now);
  return Date.UTC(year, 11, 31) / 86_400_000 - day;
}

export function countdownText(days: number): string {
  if (days === 0) return "Vanavond is het oudjaar";
  if (days === 1) return "Morgen is het oudjaar";
  return `Oudjaar over ${days} dagen`;
}

export function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

// "80s", "00s", "10s".
export function decadeLabel(decade: number): string {
  return `${String(decade % 100).padStart(2, "0")}s`;
}

// The decade with the lowest share close, flagged "Zwakst". None until two decades have answers.
export function weakestDecade(decades: MyStats["decades"]): number | null {
  const answered = decades.filter((d) => d.answered > 0);
  if (answered.length < 2) return null;
  return answered.reduce((weakest, d) => (d.close / d.answered < weakest.close / weakest.answered ? d : weakest))
    .decade;
}

export type DecadeTone = "good" | "close" | "wrong";

export function decadeTone(share: number): DecadeTone {
  if (share >= 60) return "good";
  if (share >= 45) return "close";
  return "wrong";
}

export function isEmpty(stats: MyStats): boolean {
  return stats.answers === 0 && stats.sessionsPlayed === 0;
}
