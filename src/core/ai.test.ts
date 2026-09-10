import { expect, it } from "vitest";
import { editedBody, minimalChange, type NoteContext } from "../ai";
const note: NoteContext = {
  root: "root",
  path: "Vault/Folder/Note.md",
  original: "same same same",
  body: "same same same",
  from: 5,
  to: 9,
  locked: false,
  pane: "primary",
};
it("replaces only the captured selection, never matching words elsewhere", () => {
  expect(editedBody(note, "different")).toBe("same different same");
});
it("rejects invalid selection ranges", () => {
  expect(() => editedBody({ ...note, to: 100 }, "x")).toThrow();
  expect(() => editedBody({ ...note, from: -1 }, "x")).toThrow();
});
it("uses the smallest change for undo and scroll stability", () => {
  const change = minimalChange(note.body, editedBody(note, "different"));
  expect(change).toEqual({ from: 5, to: 9, insert: "different" });
  for (const [before, after] of [
    ["", "new"],
    ["old", ""],
    ["same", "same"],
    ["abc", "axc"],
    ["😀 hello", "😀 goodbye"],
  ]) {
    const c = minimalChange(before, after);
    expect(before.slice(0, c.from) + c.insert + before.slice(c.to)).toBe(after);
  }
});
