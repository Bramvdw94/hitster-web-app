"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { searchArtists } from "@/lib/explore/actions";
import type { ArtistHit } from "@/lib/explore/explore";
import styles from "./artist-search.module.css";

type Picked = { id: string; name: string };

type Props = {
  initial: Picked | null;
  // "field": a hidden `artiest` input inside a form (Oefenen). "link": picking changes the
  // page's `artiest` query parameter and keeps the others (Ontdek).
  mode: "field" | "link";
};

const DEBOUNCE_MS = 250;

// Type an artist, pick one of the suggestions. Typos are fine: the database ranks by similarity.
export function ArtistSearch({ initial, mode }: Props) {
  const [picked, setPicked] = useState<Picked | null>(initial);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ArtistHit[]>([]);
  const [searched, setSearched] = useState(false);
  const latest = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Searches a moment after the last key, so typing doesn't fire a request per letter.
  function type(value: string) {
    setQuery(value);
    clearTimeout(timer.current);
    const request = ++latest.current;
    const q = value.trim();
    if (q.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    timer.current = setTimeout(async () => {
      const found = await searchArtists(q);
      // A slower, older request must not overwrite newer suggestions.
      if (request === latest.current) {
        setHits(found);
        setSearched(true);
      }
    }, DEBOUNCE_MS);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function choose(next: Picked | null) {
    setPicked(next);
    type("");
    if (mode === "link") {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("artiest", next.id);
      else params.delete("artiest");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  if (picked) {
    return (
      <div className={styles.picked}>
        {mode === "field" ? <input type="hidden" name="artiest" value={picked.id} /> : null}
        <span className={styles.name}>{picked.name}</span>
        <button type="button" className={styles.clear} onClick={() => choose(null)} aria-label="Andere artiest">
          ×
        </button>
      </div>
    );
  }

  return (
    <div className={styles.search}>
      <input
        type="search"
        className={styles.input}
        value={query}
        onChange={(e) => type(e.target.value)}
        placeholder="Zoek een artiest"
        aria-label="Zoek een artiest"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
      />
      {hits.length > 0 ? (
        <ul className={styles.hits}>
          {hits.map((hit) => (
            <li key={hit.id}>
              <button type="button" className={styles.hit} onClick={() => choose({ id: hit.id, name: hit.name })}>
                <span>{hit.name}</span>
                <span className={styles.count}>
                  {hit.songCount} {hit.songCount === 1 ? "nummer" : "nummers"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : searched ? (
        <p className={styles.none}>Geen artiest gevonden.</p>
      ) : null}
    </div>
  );
}
