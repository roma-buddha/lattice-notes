const globals = new Set([
  "notus-theme",
  "notus-sidebar",
  "notus-sidebar-width",
  "notus-font-family",
  "notus-font-size",
  "notus-font-weight",
]);
const prefixes = [
  "notus-vault:",
  "notus-collapsed:",
  "notus-hidden:",
  "notus-last:",
  "lotus-bookmarks:",
  "notus-note-appearance:",
  "lotus-diagram:",
];
export function exportSettings(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (
      globals.has(key) ||
      prefixes.some((p) => key === p + root || key.startsWith(p + root + ":"))
    )
      out[key] = localStorage.getItem(key)!;
  }
  return out;
}
export function importSettings(
  settings: Record<string, string>,
  oldRoot: string,
  newRoot: string,
  overwrite = true,
) {
  for (const [key, value] of Object.entries(settings)) {
    let next = globals.has(key) ? key : "";
    for (const p of prefixes)
      if (key === p + oldRoot || key.startsWith(p + oldRoot + ":"))
        next = p + newRoot + key.slice((p + oldRoot).length);
    if (
      next &&
      typeof value === "string" &&
      value.length < 2_000_000 &&
      (overwrite || localStorage.getItem(next) === null)
    )
      localStorage.setItem(next, value);
  }
  window.dispatchEvent(new Event("storage"));
}
