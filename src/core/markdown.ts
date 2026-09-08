import yaml from "js-yaml";
import type { IndexedNote, LinkRef, VaultIndex } from "../types";

export function parseLinks(content: string): LinkRef[] {
  const links: LinkRef[] = [];
  const wiki = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
  for (const match of content.matchAll(wiki))
    links.push({
      raw: match[0],
      target: match[1].trim(),
      heading: match[2]?.trim(),
      alias: match[3]?.trim(),
      start: match.index!,
      end: match.index! + match[0].length,
      kind: "wiki",
    });
  const md =
    /\[[^\]]+\]\((?!https?:|mailto:|#)([^)]+?)(?:\.md)?(?:#[^)]*)?\)/gi;
  for (const match of content.matchAll(md))
    links.push({
      raw: match[0],
      target: decodeURIComponent(match[1]).replace(/\\/g, "/"),
      start: match.index!,
      end: match.index! + match[0].length,
      kind: "markdown",
    });
  return links;
}

export function splitFrontmatter(content: string): {
  properties: Record<string, unknown>;
  body: string;
  valid: boolean;
  raw: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { properties: {}, body: content, valid: true, raw: "" };
  try {
    return {
      properties: (yaml.load(match[1]) as Record<string, unknown>) || {},
      body: content.slice(match[0].length),
      valid: true,
      raw: match[1],
    };
  } catch {
    return {
      properties: {},
      body: content.slice(match[0].length),
      valid: false,
      raw: match[1],
    };
  }
}

export function updateFrontmatter(
  content: string,
  properties: Record<string, unknown>,
): string {
  const parsed = splitFrontmatter(content);
  const body = parsed.raw
    ? content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    : content;
  return `---\n${yaml.dump(properties, { lineWidth: -1, noRefs: true }).trim()}\n---\n${body}`;
}

export function indexNotes(
  files: { path: string; content: string }[],
): VaultIndex {
  const notes: IndexedNote[] = files.map((file) => {
    const fm = splitFrontmatter(file.content);
    const heading = fm.body.match(/^#\s+(.+)$/m)?.[1];
    const title = String(
      fm.properties.title ||
        heading ||
        file.path.split("/").pop()?.replace(/\.md$/i, "") ||
        file.path,
    );
    const inlineTags = [
      ...file.content.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu),
    ].map((m) => m[1]);
    const propTags = Array.isArray(fm.properties.tags)
      ? fm.properties.tags.map(String)
      : fm.properties.tags
        ? [String(fm.properties.tags)]
        : [];
    return {
      path: file.path,
      title,
      content: file.content,
      tags: [...new Set([...inlineTags, ...propTags])],
      properties: fm.properties,
      links: parseLinks(file.content),
      headings: [...fm.body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]),
    };
  });
  const known = new Set(
    notes.flatMap((n) => [
      n.path.replace(/\.md$/i, "").toLowerCase(),
      n.title.toLowerCase(),
      n.path.split("/").pop()!.replace(/\.md$/i, "").toLowerCase(),
    ]),
  );
  const unresolved = [
    ...new Set(
      notes
        .flatMap((n) => n.links.map((l) => l.target))
        .filter((t) => !known.has(t.replace(/\.md$/i, "").toLowerCase())),
    ),
  ];
  return { notes, unresolved };
}

export function buildEdit(original: string, replacement: string) {
  return {
    before: original,
    after: replacement,
    changed: original !== replacement,
  };
}
