import { useMemo, useSyncExternalStore } from "react";
const event = "lotus-bookmarks-changed";
const key = (root: string) => `lotus-bookmarks:${root}`;
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(event, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(event, callback);
  };
}
function read(raw: string): string[] {
  try {
    return JSON.parse(raw).filter((s: unknown) => typeof s === "string");
  } catch {
    return [];
  }
}
function write(root: string, paths: string[]) {
  localStorage.setItem(key(root), JSON.stringify([...new Set(paths)]));
  window.dispatchEvent(new Event(event));
}
export function useBookmarks(root: string) {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key(root)) || "[]",
  );
  const paths = useMemo(() => read(raw), [raw]);
  return [
    paths,
    (path: string) => {
      const current = read(localStorage.getItem(key(root)) || "[]");
      write(
        root,
        current.includes(path)
          ? current.filter((p) => p !== path)
          : [...current, path],
      );
    },
  ] as const;
}
export function moveBookmarks(root: string, old: string, next: string) {
  write(
    root,
    read(localStorage.getItem(key(root)) || "[]").map((p) =>
      p === old || p.startsWith(old + "/") ? next + p.slice(old.length) : p,
    ),
  );
}
