export type BrowserSession = { id: number; url: string; title: string };

export const browserLabel = (id: number) => `browser-${id}`;

/** A blank browser tab keeps Lotus's address bar visible until navigation begins. */
export function browserAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed === "localhost" || /^[\w.-]+(?::\d+)?(?:[/#?].*)?$/.test(trimmed))
    return `https://${trimmed}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(trimmed)}`;
}
