import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EditionConfig } from "./editions";
import { selectEditions } from "./editions";
import { formatYearCsv, parseHitifyHtml } from "./hitify";
import { bestYears, joinEdition, songseekerYearsByTrack, withBestYear } from "./join";
import { artistsNeedingKind, type Existing, type IncomingCard, keepUnseenCards, type Plan, planImport } from "./plan";
import { buildReport, formatReport, totalChanges } from "./report";
import { parseCsv, parseJumbo, parseYearCsv, spotifyTrackId } from "./sources";
import { splitByFreshness } from "./stored";
import type { SpotifyTrack } from "./spotify";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

const config: EditionConfig = {
  sku: "aaaa0001",
  name: "Original",
  cardCount: 5,
  isExpansion: false,
  years: { source: "songseeker", file: "unused" },
};

const empty: Existing = { edition: null, songs: [], artists: [], songArtists: [], cards: [] };

const tracks: Record<string, SpotifyTrack | null> = {
  "1111111111111111111111": { coverUrl: "https://i/1", artists: [{ id: "barry", name: "Barry White" }], playableNl: true },
  "2222222222222222222222": { coverUrl: "https://i/2", artists: [{ id: "queen", name: "Queen" }], playableNl: true },
  "3333333333333333333333": {
    coverUrl: null,
    artists: [{ id: "peter", name: "Peter Koelewijn" }],
    playableNl: false,
  },
  "5555555555555555555555": null,
};

function incomingCards(): { incoming: IncomingCard[]; withoutTrack: number[]; withoutYearRow: number[] } {
  const { cards, withoutTrack, withoutYearRow } = joinEdition(
    parseJumbo(fixture("gameset_database.json"), "aaaa0001"),
    parseYearCsv(fixture("hitster-nl.csv")),
    "songseeker",
  );
  return { incoming: cards.map((c) => ({ ...c, track: tracks[c.spotifyTrackId] })), withoutTrack, withoutYearRow };
}

// What the database looks like after a plan is applied.
function apply(existing: Existing, plan: Plan): Existing {
  const merge = <T>(rows: T[], updates: T[], key: (row: T) => unknown) => {
    const byKey = new Map(rows.map((r) => [key(r), r]));
    for (const u of updates) byKey.set(key(u), u);
    return [...byKey.values()];
  };
  return {
    edition: plan.edition ?? existing.edition,
    songs: merge(existing.songs, plan.songs, (s) => s.spotify_track_id),
    artists: merge(existing.artists, plan.artists, (a) => a.id),
    songArtists: [
      ...existing.songArtists.filter((r) => !plan.replaceArtistsOf.includes(r.song_id)),
      ...plan.songArtists,
    ],
    cards: merge(existing.cards, plan.cards, (c) => c.card_number).filter(
      (c) => !plan.removedCards.includes(c.card_number),
    ),
  };
}

let counter = 0;
const newId = () => `id-${++counter}`;

describe("sources", () => {
  it("reads quoted CSV fields with commas and doubled quotes", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads the songseeker list", () => {
    const rows = parseYearCsv(fixture("hitster-nl.csv"));
    expect(rows).toHaveLength(5);
    expect(rows[0]).toEqual({
      cardNumber: 1,
      artist: "Barry White",
      title: "You're The First, The Last, My Everything",
      year: 1974,
    });
    expect(rows[1].title).toBe('Bohemian "Rhapsody"');
    expect(rows[4].year).toBeNull();
  });

  it("reads one edition from the Jumbo database", () => {
    const cards = parseJumbo(fixture("gameset_database.json"), "aaaa0001");
    expect(cards.map((c) => c.cardNumber)).toEqual([1, 2, 3, 5]);
    expect(cards.map((c) => c.artistKind)).toEqual(["person", "group", null, null]);
    expect(cards[1].spotifyTrackId).toBe("2222222222222222222222");
    expect(() => parseJumbo(fixture("gameset_database.json"), "zzzz9999")).toThrow("zzzz9999");
  });

  it("finds the track ID in a link or URI", () => {
    expect(spotifyTrackId("spotify:track:3333333333333333333333")).toBe("3333333333333333333333");
    expect(spotifyTrackId("nope")).toBeNull();
  });

  it("knows every Dutch edition", () => {
    const all = selectEditions("all");
    expect(all).toHaveLength(15);
    expect(all[0]).toMatchObject({ sku: "aaaa0001", years: { source: "songseeker" } });
    expect(new Set(all.map((e) => e.sku)).size).toBe(15);
    expect(selectEditions("aaaa0006").map((e) => e.years.file)).toEqual(["data/sources/hitify/aaaa0006.csv"]);
    expect(() => selectEditions("aaaa0001,bbbb")).toThrow("Unknown edition: bbbb");
  });

  it("reads hitify's card table and writes it as a year list", () => {
    const rows = parseHitifyHtml(fixture("hitify.html"));
    expect(rows).toEqual([
      { cardNumber: 1, artist: "Queen", title: "Bohemian Rhapsody - Remastered 2011", year: 1975 },
      { cardNumber: 2, artist: "Run–D.M.C., Aerosmith", title: 'Walk This Way (feat. Aerosmith) & "more"', year: null },
    ]);
    expect(parseYearCsv(formatYearCsv(rows))).toEqual(rows);
  });
});

describe("joinEdition", () => {
  it("joins on card number and labels the year", () => {
    const { incoming, withoutTrack } = incomingCards();
    expect(incoming.map((c) => c.cardNumber)).toEqual([1, 2, 3, 5]);
    expect(withoutTrack).toEqual([4]);
    expect(incoming[0]).toMatchObject({
      spotifyTrackId: "1111111111111111111111",
      title: "You're The First, The Last, My Everything",
      cardArtist: "Barry White",
      cardYear: 1974,
      yearSource: "songseeker",
      yearStatus: "certain",
      artistKind: "person",
    });
    expect(incoming[3]).toMatchObject({ cardYear: null, yearSource: null, yearStatus: "missing" });
  });

  it("trusts a hitify year only when songseeker agrees", () => {
    const jumbo = fixture("gameset_database.json");
    const songseeker = songseekerYearsByTrack(parseJumbo(jumbo, "aaaa0001"), parseYearCsv(fixture("hitster-nl.csv")));
    const hitify = [...parseHitifyHtml(fixture("hitify.html")), { cardNumber: 4, artist: "X", title: "Y", year: 2001 }];
    const { cards, withoutTrack, withoutYearRow } = joinEdition(parseJumbo(jumbo, "aaaa0006"), hitify, "hitify", songseeker);

    expect(cards.map((c) => [c.cardNumber, c.yearSource, c.yearStatus])).toEqual([
      [1, "hitify", "certain"],
      [2, null, "missing"],
    ]);
    expect(withoutTrack).toEqual([4]);
    expect(withoutYearRow).toEqual([3]);

    const disagreeing = joinEdition(parseJumbo(jumbo, "aaaa0006"), [{ ...hitify[0], year: 1976 }], "hitify", songseeker);
    expect(disagreeing.cards[0].yearStatus).toBe("uncertain");
  });

  it("gives a song in several editions the best year of all of them", () => {
    const original = incomingCards().incoming;
    const hitify = joinEdition(
      parseJumbo(fixture("gameset_database.json"), "aaaa0006"),
      [{ cardNumber: 1, artist: "Queen", title: "Bohemian Rhapsody - Remastered 2011", year: 1976 }],
      "hitify",
    ).cards;
    const best = bestYears([original, hitify]);
    // Either order of import gives the songseeker year.
    expect(bestYears([hitify, original]).get("2222222222222222222222")).toBe(best.get("2222222222222222222222"));
    expect(withBestYear(hitify[0], best)).toMatchObject({
      cardNumber: 1,
      title: 'Bohemian "Rhapsody"',
      cardYear: 1975,
      yearSource: "songseeker",
      yearStatus: "certain",
    });
  });
});

describe("planImport", () => {
  it("creates everything on the first run", () => {
    const { incoming } = incomingCards();
    const plan = planImport(config, empty, incoming, new Map([["peter", "person"]]), newId);

    expect(plan.changes).toEqual({ editions: 1, songs: 4, artists: 3, songArtists: 3, cards: 4 });
    expect(plan.songs.find((s) => s.spotify_track_id === "5555555555555555555555")).toMatchObject({
      playable_nl: false,
      cover_url: null,
      year_status: "missing",
    });
    const kinds = Object.fromEntries(plan.artists.map((a) => [a.spotify_artist_id, a.kind]));
    expect(kinds).toEqual({ barry: "person", queen: "group", peter: "person" });
    // The card's spelling becomes an alias when it differs from Spotify's.
    expect(plan.artists.find((a) => a.spotify_artist_id === "peter")!.aliases).toEqual([
      "Peter Koelewijn en Zijn Rockets",
    ]);
  });

  it("changes nothing on a second run", () => {
    const { incoming } = incomingCards();
    const kinds = new Map([["peter", "person" as const]]);
    const afterFirst = apply(empty, planImport(config, empty, incoming, kinds, newId));
    const second = planImport(config, afterFirst, incoming, kinds, newId);

    expect(totalChanges(second.changes)).toBe(0);
    expect([second.edition, ...second.songs, ...second.artists, ...second.cards, ...second.songArtists]).toEqual([
      null,
    ]);
    expect(second.editionId).toBe(afterFirst.edition!.id);
  });

  it("writes only what Spotify changed", () => {
    const { incoming } = incomingCards();
    const afterFirst = apply(empty, planImport(config, empty, incoming, new Map(), newId));
    const later = incoming.map((c) =>
      c.cardNumber === 3 ? { ...c, track: { ...c.track!, playableNl: true } } : c,
    );
    const plan = planImport(config, afterFirst, later, new Map(), newId);

    expect(plan.changes).toEqual({ editions: 0, songs: 1, artists: 0, songArtists: 0, cards: 0 });
    expect(plan.songs[0]).toMatchObject({ spotify_track_id: "3333333333333333333333", playable_nl: true });
  });

  it("keeps a stored artist kind and asks MusicBrainz only for unknown kinds", () => {
    const { incoming } = incomingCards();
    expect(artistsNeedingKind(empty, incoming)).toEqual([{ id: "peter", name: "Peter Koelewijn" }]);

    const afterFirst = apply(empty, planImport(config, empty, incoming, new Map(), newId));
    const fixed = {
      ...afterFirst,
      artists: afterFirst.artists.map((a) => (a.spotify_artist_id === "queen" ? { ...a, kind: "person" as const } : a)),
    };
    const plan = planImport(config, fixed, incoming, new Map(), newId);
    expect(plan.artists.map((a) => a.spotify_artist_id)).toEqual([]);
  });

  it("removes a card that left the source", () => {
    const { incoming } = incomingCards();
    const afterFirst = apply(empty, planImport(config, empty, incoming, new Map(), newId));
    const plan = planImport(config, afterFirst, incoming.slice(0, 3), new Map(), newId);
    expect(plan.removedCards).toEqual([5]);
    expect(plan.changes.cards).toBe(1);
  });
});

describe("several editions", () => {
  it("keeps a song printed in two editions as one song with two cards", () => {
    const original = incomingCards().incoming;
    const afterOriginal = apply(empty, planImport(config, empty, original, new Map(), newId));

    const hitify = joinEdition(
      parseJumbo(fixture("gameset_database.json"), "aaaa0006"),
      parseHitifyHtml(fixture("hitify.html")),
      "hitify",
    ).cards;
    const best = bestYears([original, hitify]);
    const guilty: IncomingCard[] = hitify.map((c) => ({ ...withBestYear(c, best), track: tracks[c.spotifyTrackId] ?? null }));
    const guiltyConfig = { ...config, sku: "aaaa0006", name: "Guilty Pleasures", cardCount: 334 };
    const existing = { ...afterOriginal, edition: null, cards: [] };
    const plan = planImport(guiltyConfig, existing, guilty, new Map(), newId);

    const queen = afterOriginal.songs.find((s) => s.spotify_track_id === "2222222222222222222222")!;
    expect(plan.songs.map((s) => s.spotify_track_id)).toEqual(["9999999999999999999999"]);
    expect(plan.cards.find((c) => c.card_number === 1)).toMatchObject({ song_id: queen.id });
    expect(plan.changes).toMatchObject({ editions: 1, songs: 1, cards: 2 });
  });
});

describe("a run that stops early", () => {
  it("adds the cards it knows and keeps the rest", () => {
    const { incoming } = incomingCards();
    const before = apply(empty, planImport(config, empty, incoming, new Map(), newId));
    const partial = planImport(config, before, incoming.slice(0, 2), new Map(), newId);
    expect(partial.removedCards).toEqual([3, 5]);

    const kept = keepUnseenCards(partial);
    expect(kept.removedCards).toEqual([]);
    expect(kept.changes.cards).toBe(0);
  });
});

describe("report", () => {
  it("counts cards, missing years and unplayable songs", () => {
    const { incoming, withoutTrack, withoutYearRow } = incomingCards();
    const changes = { editions: 0, songs: 0, artists: 0, songArtists: 0, cards: 0 };
    const report = buildReport(config, incoming, { withoutTrack, withoutYearRow }, changes);

    expect(report).toMatchObject({
      cards: 4,
      expectedCards: 5,
      withoutTrack: [4],
      withoutYearRow: [],
      withoutYear: [5],
      musicbrainzYears: [],
      waitingForSpotify: [],
      uncertainYears: [],
      notOnSpotify: [5],
      notPlayableNl: [3, 5],
    });
    const text = formatReport(report);
    expect(text).toContain("| Cards | 4 of 5 |");
    expect(text).toContain("| Not playable in NL | 2 (cards 3, 5) |");
    expect(text).toContain("| Changed | no changes |");

    expect(formatReport(buildReport(config, incoming, { withoutTrack, withoutYearRow }, changes, [7, 8]))).toContain(
      "| Waiting for a later run (Spotify budget) | 2 (cards 7, 8) |",
    );
    const many = formatReport({ ...report, uncertainYears: Array.from({ length: 21 }, (_, i) => i + 1) });
    expect(many).toContain("| Uncertain years | 21 |");
  });
});

describe("splitByFreshness", () => {
  const now = new Date("2026-10-29T12:00:00Z");
  const track = { coverUrl: null, artists: [{ id: "queen", name: "Queen" }], playableNl: true };

  it("reuses tracks checked recently and looks up the rest", () => {
    const { incoming } = incomingCards();
    const stored = new Map([
      ["1111111111111111111111", { checkedAt: "2026-10-28T12:00:00Z", track }],
      ["2222222222222222222222", { checkedAt: "2026-09-01T12:00:00Z", track }],
      ["3333333333333333333333", { checkedAt: "2026-10-28T12:00:00Z", track: { ...track, artists: [] } }],
    ]);
    const { reused, toLookUp } = splitByFreshness(incoming, stored, { now });

    expect([...reused.keys()]).toEqual(["1111111111111111111111"]);
    expect(toLookUp).toEqual(["2222222222222222222222", "3333333333333333333333", "5555555555555555555555"]);
  });

  it("looks everything up again on request", () => {
    const { incoming } = incomingCards();
    const stored = new Map([["1111111111111111111111", { checkedAt: "2026-10-28T12:00:00Z", track }]]);
    expect(splitByFreshness(incoming, stored, { now, recheck: true }).toLookUp).toHaveLength(4);
  });
});
