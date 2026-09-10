import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cells, findTables, serializeTable } from "./tables";
describe("portable Markdown tables", () => {
  it("renders exported cells using the independent GFM renderer",()=>{
    const markdown=serializeTable([["Name","Value"],["a | b","C:\\notes\\"]]);
    const html=renderToStaticMarkup(createElement(ReactMarkdown,{remarkPlugins:[remarkGfm],children:markdown}));
    expect(html).toContain("<table>");expect(html).toContain("a | b");expect(html).toContain("C:\\notes\\");
  });
  it("preserves existing Markdown escapes in untouched cells", () => {
    const table = findTables(
      "| A | B |\n| --- | --- |\n| \\*literal\\* | old |",
    )[0];
    table.rows[1][1] = "new";
    expect(
      serializeTable(table.rows, table.alignment, table.rawRows),
    ).toContain("| \\*literal\\* | new |");
  });
  it("round trips literal pipes, slashes, Unicode and formatting", () => {
    const rows = [
      ["Heading", "Title"],
      ["a | b", "C:\\notes\\"],
      ["**bold**", "Café 中文"],
    ];
    expect(findTables(serializeTable(rows))[0].rows).toEqual(rows);
  });
  it("keeps surrounding text and alignment", () => {
    const source = "Before\n\n| A | B |\n| :--- | ---: |\n| x | y |\n\nAfter";
    const table = findTables(source)[0];
    expect(source.slice(table.from, table.to)).toBe(
      "| A | B |\n| :--- | ---: |\n| x | y |",
    );
    expect(table.alignment).toEqual([":---", "---:"]);
  });
  it("leaves frontmatter and fenced code alone", () => {
    const t = "| A | B |\n| --- | --- |\n| x | y |";
    expect(
      findTables(`---\n${t}\n---\n\n\`\`\`md\n${t}\n\`\`\`\n\n${t}`),
    ).toHaveLength(1);
  });
  it("ignores malformed widths and preserves a following paragraph", () => {
    expect(findTables("| A | B |\n| --- |\n")).toEqual([]);
    expect(
      findTables("| A | B |\n| --- | --- |\ntext | paragraph | extra")[0].rows,
    ).toHaveLength(1);
  });
  it("accepts optional outer pipes", () => {
    expect(cells("A | B")).toEqual(["A", "B"]);
  });
});
