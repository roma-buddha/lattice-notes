export type MarkdownTable = {
  from: number;
  to: number;
  rows: string[][];
  rawRows: string[][];
  alignment: string[];
};
export function cells(line: string, raw = false): string[] {
  const value = line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "");
  const result: string[] = [];
  let cell = "";
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && (value[i + 1] === "|" || value[i + 1] === "\\")) {
      cell += (raw ? "\\" : "") + value[++i];
    } else if (c === "|") {
      result.push(cell.trim());
      cell = "";
    } else cell += c;
  }
  result.push(cell.trim());
  return result;
}
export function serializeTable(
  rows: string[][],
  alignment?: string[],
  rawRows?: string[][],
): string {
  const row = (values: string[], raw?: string[]) =>
    "| " +
    values
      .map((v, i) =>
        raw?.[i] !== undefined && cells(`| ${raw[i]} |`)[0] === v
          ? raw[i]
          : v
              .replace(/\\/g, "\\\\")
              .replace(/\|/g, "\\|")
              .replace(/[\r\n]+/g, " "),
      )
      .join(" | ") +
    " |";
  return [
    row(rows[0], rawRows?.[0]),
    row(rows[0].map((_, i) => alignment?.[i] || "---")),
    ...rows.slice(1).map((values, i) => row(values, rawRows?.[i + 1])),
  ].join("\n");
}
export function findTables(text: string): MarkdownTable[] {
  const lines = text.split("\n");
  const result: MarkdownTable[] = [];
  let offset = 0;
  let fence = "";
  let frontmatter = lines[0]?.trim() === "---";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (frontmatter) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      offset += line.length + 1;
      continue;
    }
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length)
        fence = "";
      offset += line.length + 1;
      continue;
    }
    if (
      !fence &&
      line.includes("|") &&
      !/^\s{4}/.test(line) &&
      lines[i + 1]?.includes("|")
    ) {
      const header = cells(line),
        alignment = cells(lines[i + 1]);
      if (
        header.length === alignment.length &&
        alignment.every((v) => /^:?-{3,}:?$/.test(v))
      ) {
        const from = offset;
        const rows = [header];
        const rawRows = [cells(line, true)];
        offset += line.length + 1 + lines[++i].length + 1;
        while (
          lines[i + 1]?.trim() &&
          lines[i + 1].includes("|") &&
          !/^\s{4}/.test(lines[i + 1])
        ) {
          const next = cells(lines[i + 1]);
          if (next.length !== header.length) break;
          rows.push(next);
          rawRows.push(cells(lines[i + 1], true));
          offset += lines[++i].length + 1;
        }
        result.push({
          from,
          to: Math.min(text.length, offset - 1),
          rows,
          rawRows,
          alignment,
        });
        continue;
      }
    }
    offset += line.length + 1;
  }
  return result;
}
