"use client";

import { useEffect, useId, useMemo, useState, type InputHTMLAttributes, type KeyboardEvent } from "react";
import { loadSuggestionLists, type SuggestionLists } from "@/lib/zoekhulp/actions";
import { prepare, suggest, type Entry } from "@/lib/zoekhulp/suggest";
import styles from "./suggest-input.module.css";

type Lists = { artist: Entry[]; title: Entry[] };

// One download of the catalogue's names per page visit, shared by every field and turn.
let cached: Promise<Lists> | null = null;

function loadLists(): Promise<Lists> {
  cached ??= loadSuggestionLists().then(
    (lists: SuggestionLists) => ({ artist: prepare(lists.artists), title: prepare(lists.titles) }),
    (error: unknown) => {
      cached = null;
      throw error;
    },
  );
  return cached;
}

function useLists(enabled: boolean): Lists | null {
  const [lists, setLists] = useState<Lists | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Without the lists the field is a plain input, so a failed download only costs the help.
    loadLists().then((l) => live && setLists(l), () => undefined);
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled ? lists : null;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  kind: "artist" | "title";
  // Off: a plain input, exactly as without Zoekhulp.
  enabled: boolean;
  value: string;
  onValue: (value: string) => void;
  // "below" under the field; "above" where the keyboard would cover a list below (landscape).
  placement?: "below" | "above";
  // "self": the list is as wide as the field. "parent": as wide as the nearest positioned
  // parent, for two fields side by side in the portrait card.
  anchor?: "self" | "parent";
  wrapClassName?: string;
};

// A text field that, with Zoekhulp on, offers names from the catalogue from 3 letters on.
// Picking one only fills the field: the answer is judged exactly like a typed one.
export function SuggestInput({
  kind,
  enabled,
  value,
  onValue,
  placement = "below",
  anchor = "self",
  wrapClassName,
  onKeyDown,
  onBlur,
  ...input
}: Props) {
  const lists = useLists(enabled);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const id = useId();
  const hits = useMemo(() => (lists ? suggest(value, lists[kind]) : []), [lists, kind, value]);
  const shown = open && hits.length > 0;

  function pick(name: string) {
    onValue(name);
    setOpen(false);
    setActive(-1);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (shown) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        // -1 is "nothing chosen", so the arrows can also go back to what you typed.
        setActive((i) => {
          const next = i + step;
          return next < -1 ? hits.length - 1 : next >= hits.length ? -1 : next;
        });
        return;
      }
      if (event.key === "Enter" && active >= 0 && active < hits.length) {
        event.preventDefault();
        pick(hits[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
    }
    onKeyDown?.(event);
  }

  const wrap = [anchor === "parent" ? styles.contents : styles.wrap, wrapClassName].filter(Boolean).join(" ");

  return (
    <div className={wrap}>
      <input
        {...input}
        value={value}
        onChange={(event) => {
          onValue(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={keyDown}
        onBlur={(event) => {
          setOpen(false);
          onBlur?.(event);
        }}
        role={enabled ? "combobox" : undefined}
        aria-autocomplete={enabled ? "list" : undefined}
        aria-expanded={enabled ? shown : undefined}
        aria-controls={shown ? id : undefined}
        aria-activedescendant={shown && active >= 0 ? `${id}-${active}` : undefined}
      />
      {shown ? (
        <ul id={id} role="listbox" className={`${styles.list} ${placement === "above" ? styles.above : styles.below}`}>
          {hits.map((name, i) => (
            <li
              key={name}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? styles.active : undefined}
              // Mousedown, not click: picking must happen before the field loses focus.
              onMouseDown={(event) => {
                event.preventDefault();
                pick(name);
              }}
            >
              {name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
