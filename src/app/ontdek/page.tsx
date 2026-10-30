import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ArtistSearch } from "@/components/artist-search/artist-search";
import {
  artistName,
  catalogueYears,
  EXPLORE_LIMIT,
  exploreSongs,
  type ExploreSong,
} from "@/lib/explore/explore";
import {
  decadeOfRange,
  decadesBetween,
  filterQuery,
  fromSearchParams,
  isFiltered,
  rangeLabel,
  type PracticeFilter,
} from "@/lib/practice/filter";
import { KNOWN_BOX } from "@/lib/practice/leitner";
import { yearsOffText } from "@/lib/stats/stats";
import { createClient } from "@/lib/supabase/server";
import { startPractice } from "../oefenen/actions";
import styles from "./ontdek.module.css";

export const metadata = { title: "Ontdek · Jaartal" };

// The songs grouped by card year, oldest first; the songs arrive sorted already.
function byYear(songs: ExploreSong[]): { year: number; songs: ExploreSong[] }[] {
  const groups: { year: number; songs: ExploreSong[] }[] = [];
  for (const song of songs) {
    const last = groups.at(-1);
    if (last?.year === song.cardYear) last.songs.push(song);
    else groups.push({ year: song.cardYear, songs: [song] });
  }
  return groups;
}

function boxText(box: number | null): string {
  if (box === null) return "nog niet gehoord";
  return box === KNOWN_BOX ? "gekend" : `doos ${box}`;
}

function Song({ song }: { song: ExploreSong }) {
  return (
    <li className={styles.song}>
      {song.coverUrl ? (
        // Spotify's own cover, shown as ADR 0001 requires.
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.cover} src={song.coverUrl} alt="" width={44} height={44} loading="lazy" />
      ) : (
        <span className={styles.cover} aria-hidden="true" />
      )}
      <span className={styles.songText}>
        <span className={styles.title}>{song.title}</span>
        <span className={styles.artist}>{song.artists ?? "Onbekende artiest"}</span>
        <span className={styles.meta}>
          <span className={song.box === KNOWN_BOX ? styles.known : undefined}>{boxText(song.box)}</span>
          {song.avgOff !== null ? (
            <span>
              {" · "}
              {yearsOffText(song.avgOff)} ({song.guesses}×)
            </span>
          ) : null}
          {song.uncertainYear ? <span>{" · "}jaar onzeker</span> : null}
        </span>
      </span>
    </li>
  );
}

function Search({ filter, artist, decades }: { filter: PracticeFilter; artist: string | null; decades: number[] }) {
  const active = decadeOfRange(filter);
  const withArtist = (range: Partial<PracticeFilter>) =>
    `/ontdek${filterQuery({ artistId: filter.artistId, yearFrom: null, yearTo: null, ...range })}`;
  const ownRange = !active && (filter.yearFrom !== null || filter.yearTo !== null);

  return (
    <section className={styles.search} aria-label="Zoeken">
      <div>
        <p className={styles.label}>Artiest</p>
        <Suspense fallback={<div className={styles.fieldPlaceholder} />}>
          <ArtistSearch
            key={filter.artistId ?? "none"}
            mode="link"
            initial={artist && filter.artistId ? { id: filter.artistId, name: artist } : null}
          />
        </Suspense>
      </div>
      <div>
        <p className={styles.label}>Periode</p>
        <div className={styles.chips}>
          <Link href={withArtist({})} className={filter.yearFrom === null && filter.yearTo === null ? styles.chipOn : styles.chip}>
            Alle jaren
          </Link>
          {decades.map((d) => (
            <Link key={d} href={withArtist({ yearFrom: d, yearTo: d + 9 })} className={active === d ? styles.chipOn : styles.chip}>
              {String(d % 100).padStart(2, "0")}s
            </Link>
          ))}
        </div>
        <form action="/ontdek" className={styles.range}>
          {filter.artistId ? <input type="hidden" name="artiest" value={filter.artistId} /> : null}
          <label>
            <span>Van</span>
            <input
              type="number"
              name="van"
              inputMode="numeric"
              min={1800}
              max={2100}
              placeholder="1975"
              defaultValue={ownRange ? (filter.yearFrom ?? undefined) : undefined}
            />
          </label>
          <label>
            <span>Tot en met</span>
            <input
              type="number"
              name="tot"
              inputMode="numeric"
              min={1800}
              max={2100}
              placeholder="1985"
              defaultValue={ownRange ? (filter.yearTo ?? undefined) : undefined}
            />
          </label>
          <button type="submit" className={styles.go}>
            Toon
          </button>
        </form>
      </div>
    </section>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/ontdek">["searchParams"] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims.sub) redirect("/login");

  const filter = fromSearchParams(await searchParams);
  const [artist, years, result] = await Promise.all([
    artistName(supabase, filter.artistId),
    catalogueYears(supabase),
    isFiltered(filter) ? exploreSongs(supabase, filter) : Promise.resolve(null),
  ]);
  const heading = [artist, rangeLabel(filter)].filter(Boolean).join(" · ");

  return (
    <>
      <Search filter={filter} artist={artist} decades={decadesBetween(years.oldest, years.newest)} />
      {result === null ? (
        <p className={styles.hint}>Kies een artiest of een periode, dan zie je de nummers op een tijdlijn.</p>
      ) : result.total === 0 ? (
        <p className={styles.hint}>Geen nummers gevonden. Probeer een andere artiest of periode.</p>
      ) : (
        <section aria-label="Tijdlijn" className={styles.results}>
          <div className={styles.resultHead}>
            <h2 className={styles.heading}>{heading}</h2>
            <p className={styles.hint}>
              {result.total} {result.total === 1 ? "nummer" : "nummers"}
              {result.total > result.songs.length
                ? `, de oudste ${EXPLORE_LIMIT} staan hier. Kies een kortere periode voor de rest.`
                : ", van oud naar nieuw."}
            </p>
            <form action={startPractice}>
              {filter.artistId ? <input type="hidden" name="artiest" value={filter.artistId} /> : null}
              {filter.yearFrom !== null ? <input type="hidden" name="van" value={filter.yearFrom} /> : null}
              {filter.yearTo !== null ? <input type="hidden" name="tot" value={filter.yearTo} /> : null}
              <button type="submit" className={styles.cta}>
                Oefen deze nummers
              </button>
            </form>
          </div>
          <ol className={styles.timeline}>
            {byYear(result.songs).map((group) => (
              <li key={group.year} className={styles.year}>
                <Link href={`/ontdek${filterQuery({ ...filter, yearFrom: group.year, yearTo: group.year })}`} className={styles.yearLabel}>
                  {group.year}
                </Link>
                <ul className={styles.songs}>
                  {group.songs.map((song) => (
                    <Song key={song.id} song={song} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

export default function ExplorePage({ searchParams }: PageProps<"/ontdek">) {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.back}>
          ← Terug
        </Link>
        <h1 className={styles.title}>Ontdek</h1>
        <p className={styles.hint}>Zoek op artiest, decennium of jaartal en zie alle nummers op een tijdlijn.</p>
      </header>
      <Suspense fallback={<div className={styles.placeholder} />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
