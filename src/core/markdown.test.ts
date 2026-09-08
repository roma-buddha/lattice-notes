import { describe, expect, it } from "vitest";
import {
  buildEdit,
  indexNotes,
  parseLinks,
  splitFrontmatter,
  updateFrontmatter,
} from "./markdown";
describe("markdown core", () => {
  it("parses wiki aliases, headings and markdown links", () => {
    const links = parseLinks(
      "[[Alpha|A]] [[Beta#Part]] [Gamma](folder/Gamma.md)",
    );
    expect(links.map((l) => [l.target, l.alias, l.heading])).toEqual([
      ["Alpha", "A", undefined],
      ["Beta", undefined, "Part"],
      ["folder/Gamma", undefined, undefined],
    ]);
  });
  it("keeps invalid YAML recoverable", () => {
    expect(splitFrontmatter("---\na: [\n---\nBody").valid).toBe(false);
  });
  it("updates typed properties", () => {
    expect(
      updateFrontmatter("# Note", { done: true, count: 2, tags: ["x"] }),
    ).toContain("done: true");
  });
  it("finds unresolved links and metadata", () => {
    const x = indexNotes([
      { path: "A.md", content: "---\ntags: [idea]\n---\n# A\n[[Missing]]" },
    ]);
    expect(x.notes[0].tags).toContain("idea");
    expect(x.unresolved).toEqual(["Missing"]);
  });
  it("builds reviewable edits", () => {
    expect(buildEdit("a", "b")).toEqual({
      before: "a",
      after: "b",
      changed: true,
    });
  });
});
