import { describe, expect, it } from "vitest";
import {
  buildEdit,
  indexNotes,
  parseLinks,
  splitFrontmatter,
  updateFrontmatter,
  relativeNoteLink,
} from "./markdown";
describe("markdown core", () => {
  it("writes portable relative note links, including spaces and punctuation", () => {
    expect(relativeNoteLink("Work/Notes/A.md", "Work/Notes/B.md")).toBe("B.md");
    expect(relativeNoteLink("Work/Notes/A.md", "Personal/Journal/Some (note)#1.md")).toBe("../../Personal/Journal/Some%20%28note%29%231.md");
  });
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
  it("preserves dates as strings, scalar types, arrays and nested metadata",()=>{
    const text="---\ncreated: 2026-08-26\ntags: [one, two]\nnumber: 5\nflag: true\nnested:\n  keep: value\n---\nBody";
    const parsed=splitFrontmatter(text);
    expect(parsed.properties.created).toBe("2026-08-26");
    expect(splitFrontmatter(updateFrontmatter(text,{...parsed.properties,title:"new"})).properties).toEqual({...parsed.properties,title:"new"});
  });
  it("does not duplicate empty frontmatter",()=>{
    const text=updateFrontmatter("---\n\n---\nBody",{title:"new"});
    expect(text.match(/^---$/gm)?.length).toBe(2);
    expect(splitFrontmatter(text).body).toBe("Body");
  });
  it("rejects non-mapping frontmatter without losing its body",()=>{
    expect(splitFrontmatter("---\n- not a mapping\n---\nBody")).toMatchObject({valid:false,body:"Body"});
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
