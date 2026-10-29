import { describe, expect, it } from "vitest";
import { dueInterval, nextBox } from "./leitner";
import { dealSession, dealWeakSession, decadeWeights, seededRandom, type Candidate } from "./mix";

function fresh(id: string, cardYear = 1985): Candidate {
  return { id, cardYear, box: null, lastSeen: null, dueAt: null };
}

function seen(id: string, box: number, lastSeen: number, dueAt: number, cardYear = 1985): Candidate {
  return { id, cardYear, box, lastSeen, dueAt };
}

const range = (n: number, make: (i: number) => Candidate) => Array.from({ length: n }, (_, i) => make(i));

describe("dealSession", () => {
  it("deals 15 distinct songs", () => {
    const songs = range(40, (i) => fresh(`n${i}`));
    const dealt = dealSession(songs, [], 1, seededRandom(1));
    expect(dealt).toHaveLength(15);
    expect(new Set(dealt).size).toBe(15);
  });

  it("takes up to 8 due repeats, lowest box first, then oldest due, and 7 new songs", () => {
    const due = [
      ...range(5, (i) => seen(`b3-${i}`, 3, 1, 5)),
      ...range(5, (i) => seen(`b1-${i}`, 1, 9, 10 - (i % 2))),
    ];
    const notDue = range(5, (i) => seen(`later-${i}`, 4, 9, 17));
    const news = range(20, (i) => fresh(`n${i}`));
    const dealt = dealSession([...due, ...notDue, ...news], [], 10, seededRandom(7));

    const repeats = dealt.filter((id) => !id.startsWith("n"));
    expect(repeats).toHaveLength(8);
    expect(repeats.filter((id) => id.startsWith("b1-"))).toHaveLength(5);
    expect(repeats.filter((id) => id.startsWith("b3-"))).toHaveLength(3);
    expect(dealt.filter((id) => id.startsWith("n"))).toHaveLength(7);
  });

  it("fills with new songs when few repeats are due", () => {
    const songs = [seen("due", 1, 3, 4), seen("later", 5, 3, 19), ...range(20, (i) => fresh(`n${i}`))];
    const dealt = dealSession(songs, [], 4, seededRandom(3));
    expect(dealt).toContain("due");
    expect(dealt).not.toContain("later");
    expect(dealt.filter((id) => id.startsWith("n"))).toHaveLength(14);
  });

  it("fills with the least recently seen songs when no new songs are left", () => {
    const songs = [
      seen("due", 1, 9, 10),
      ...range(20, (i) => seen(`s${i}`, 5, i, i + 16)),
      fresh("n0"),
    ];
    const dealt = dealSession(songs, [], 10, seededRandom(5));
    expect(dealt).toHaveLength(15);
    expect(dealt).toContain("due");
    expect(dealt).toContain("n0");
    // 13 fillers, longest unseen first: s0 to s12.
    expect(dealt.filter((id) => id.startsWith("s")).sort()).toEqual(range(13, (i) => fresh(`s${i}`)).map((c) => c.id).sort());
  });

  it("deals everything when the editions have fewer than 15 songs", () => {
    const dealt = dealSession(range(6, (i) => fresh(`n${i}`)), [], 1, seededRandom(1));
    expect(dealt).toHaveLength(6);
  });

  it("is the same deal for the same seed", () => {
    const songs = range(60, (i) => fresh(`n${i}`, 1950 + i));
    expect(dealSession(songs, [], 1, seededRandom(42))).toEqual(dealSession(songs, [], 1, seededRandom(42)));
  });

  it("deals more new songs from the decades the player gets wrong", () => {
    const songs = [...range(100, (i) => fresh(`a${i}`, 1975)), ...range(100, (i) => fresh(`b${i}`, 1995))];
    const stats = [
      { decade: 1970, answered: 20, close: 2 },
      { decade: 1990, answered: 20, close: 18 },
    ];
    let seventies = 0;
    let nineties = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const dealt = dealSession(songs, stats, 1, seededRandom(seed));
      seventies += dealt.filter((id) => id.startsWith("a")).length;
      nineties += dealt.filter((id) => id.startsWith("b")).length;
    }
    expect(seventies).toBeGreaterThan(nineties * 3);
  });
});

describe("decadeWeights", () => {
  it("is uniform with no history", () => {
    const weight = decadeWeights([]);
    expect(weight(1960)).toBe(weight(2010));
  });

  it("weighs the weakest decade most and gives unplayed decades the overall share", () => {
    const weight = decadeWeights([
      { decade: 1970, answered: 10, close: 2 },
      { decade: 1990, answered: 10, close: 8 },
    ]);
    expect(weight(1970)).toBeCloseTo(0.8);
    expect(weight(1990)).toBeCloseTo(0.2);
    expect(weight(2010)).toBeCloseTo(0.5);
  });

  it("never drops a decade to zero", () => {
    expect(decadeWeights([{ decade: 1980, answered: 5, close: 5 }])(1980)).toBeGreaterThan(0);
  });
});

describe("dealWeakSession", () => {
  it("takes up to 15 weak songs, lowest box first", () => {
    const songs = [...range(10, (i) => seen(`b2-${i}`, 2, i, i + 2)), ...range(10, (i) => seen(`b1-${i}`, 1, i, i + 1))];
    const dealt = dealWeakSession(songs, seededRandom(1));
    expect(dealt).toHaveLength(15);
    expect(dealt.filter((id) => id.startsWith("b1-"))).toHaveLength(10);
  });

  it("deals nothing without weak songs", () => {
    expect(dealWeakSession([], seededRandom(1))).toEqual([]);
  });
});

describe("a song through the sessions", () => {
  // Plays one song: wrong in session 1, then right every time it comes back.
  it("comes back the next session after a miss and is known after 4 right answers", () => {
    let progress = seen("song", 1, 1, 1 + dueInterval(nextBox(1, 5)));
    expect(progress.dueAt).toBe(2);

    const others = range(30, (i) => fresh(`n${i}`));
    let session = 2;
    for (let right = 0; right < 4; right++) {
      // Not dealt before it is due ...
      for (; session < progress.dueAt!; session++) {
        expect(dealSession([progress, ...others], [], session, seededRandom(session))).not.toContain("song");
      }
      // ... and dealt when it is.
      expect(dealSession([progress, ...others], [], session, seededRandom(session))).toContain("song");
      const box = nextBox(progress.box!, 0);
      progress = seen("song", box, session, session + dueInterval(box));
      session++;
    }
    expect(progress.box).toBe(5);
  });
});
