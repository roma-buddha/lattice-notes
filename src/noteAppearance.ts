import { useMemo, useSyncExternalStore } from "react";
export type NoteAppearance = {
  textWidth: "comfortable" | "wide";
  alignment: "left" | "center" | "right" | "justify";
  highlights: number[];
  widths: Record<number, number[]>;
};
const eventName = "notus-appearance-changed";
const keyFor = (root: string, path: string) =>
  `notus-note-appearance:${root}:${path}`;
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(eventName, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(eventName, callback);
  };
}
function parse(raw: string): NoteAppearance {
  try {
    const v = JSON.parse(raw);
    return {
      textWidth: v.textWidth === "wide" ? "wide" : "comfortable",
      widths: v.widths && typeof v.widths === "object" ? v.widths : {},
      alignment: ["left", "center", "right", "justify"].includes(v.alignment)
        ? v.alignment
        : "justify",
      highlights: Array.isArray(v.highlights)
        ? v.highlights.filter(
            (n: unknown) => Number.isInteger(n) && Number(n) >= 0,
          )
        : [],
    };
  } catch {
    return {
      alignment: "justify",
      highlights: [],
      widths: {},
      textWidth: "comfortable",
    };
  }
}
export function useNoteAppearance(root: string, path: string) {
  const key = keyFor(root, path);
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key) || "{}",
  );
  const appearance = useMemo(() => parse(raw), [raw]);
  const update = (patch: Partial<NoteAppearance>) => {
    localStorage.setItem(
      key,
      JSON.stringify({ ...parse(localStorage.getItem(key) || "{}"), ...patch }),
    );
    window.dispatchEvent(new Event(eventName));
  };
  return [appearance, update] as const;
}
export function moveNoteAppearance(root: string, old: string, next: string) {
  const prefix = keyFor(root, old);
  for (const key of Object.keys(localStorage)) {
    if (key === prefix || key.startsWith(prefix + "/")) {
      localStorage.setItem(
        keyFor(root, next) + key.slice(prefix.length),
        localStorage.getItem(key)!,
      );
      localStorage.removeItem(key);
    }
  }
  window.dispatchEvent(new Event(eventName));
}
