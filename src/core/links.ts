/** Treat bare domains as websites, but never execute arbitrary URL schemes. */
export function websiteUrl(value: string): string | null {
  const text = value.trim();
  const candidate = /^https?:\/\//i.test(text)
    ? text
    : /^(?:www\.)?[a-z\d](?:[a-z\d.-]*\.)[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?$/i.test(
          text,
        ) && !/\.(md|markdown)(?:#.*)?$/i.test(text)
      ? `https://${text}`
      : null;
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) && !!url.hostname
      ? url.href
      : null;
  } catch {
    return null;
  }
}
