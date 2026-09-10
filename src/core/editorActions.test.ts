import { describe, it, expect } from "vitest";
import {
  colorTarget,
  clearTarget,
  lineTarget,
  wrapTarget,
  blockTarget,
  type EditTarget,
} from "../editTarget";
import { editorItems } from "../EditorMenu";
function target(text: string, from = 0, to = text.length) {
  let result = text;
  const value: EditTarget = {
    text,
    from,
    to,
    replace: (a, b, insert) => {
      result = result.slice(0, a) + insert + result.slice(b);
    },
    selectAll: () => {},
  };
  return { value, result: () => result };
}
describe("selection-safe formatting", () => {
  it("clears nested formatting and color around the exact visible selection", () => {
    const source = '<span style="color: #357ac2">==***word***==</span>';
    const t = target(
      source,
      source.indexOf("word"),
      source.indexOf("word") + 4,
    );
    clearTarget(t.value);
    expect(t.result()).toBe("word");
  });
  it("removes formatting from a selected word inside a longer formatted phrase", () => {
    const t = target("**hello world again**", 8, 13);
    wrapTarget(t.value, "**");
    expect(t.result()).toBe("**hello** world **again**");
    const u = target("*hello world*", 7, 12);
    wrapTarget(u.value, "*");
    expect(u.result()).toBe("*hello* world");
  });
  it("toggles emphasis around visually selected nested bold text", () => {
    const t = target("***pointer***", 3, 10);
    wrapTarget(t.value, "*");
    expect(t.result()).toBe("**pointer**");
    const b = target("***pointer***", 3, 10);
    wrapTarget(b.value, "**");
    expect(b.result()).toBe("*pointer*");
    const i = target("**pointer**", 2, 9);
    wrapTarget(i.value, "*");
    expect(i.result()).toBe("***pointer***");
  });
  it("keeps block insertions separate from surrounding paragraphs", () => {
    const t = target("before sample after", 7, 13);
    blockTarget(t.value, "code");
    expect(t.result()).toBe("before \n\n```\nsample\n```\n\n after");
    const c = target("first\nsecond");
    blockTarget(c.value, "callout");
    expect(c.result()).toBe("> [!NOTE]\n> first\n> second\n");
    const rule = target("", 0, 0);
    blockTarget(rule.value, "rule");
    expect(rule.result()).toBe("---\n");
  });
  it("does not format a following unselected line", () => {
    const t = target("one\ntwo\nthree", 0, 4);
    lineTarget(t.value, "- ");
    expect(t.result()).toBe("- one\ntwo\nthree");
  });
  it("omits bookmarks and prevents nested Markdown blocks in cells", () => {
    const t = target("sample");
    t.value.kind = "cell";
    const items = editorItems(t.value, {
      locked: false,
      lock: () => {},
      bookmarked: false,
      bookmark: () => {},
      link: () => {},
      table: () => {},
      search: () => {},
      error: () => {},
    });
    expect(items.some((i) => /bookmark/i.test(i.label))).toBe(false);
    expect(items.find((i) => i.label === "Paragraph")?.disabled).toBe(true);
    expect(
      items
        .find((i) => i.label === "Insert")
        ?.children?.filter((i) => i.label !== "Link…")
        .every((i) => i.disabled),
    ).toBe(true);
    expect(items.find((i) => i.label === "Remove link")?.disabled).toBe(true);
  });
  it("changes only selected text and removes color cleanly", () => {
    const t = target("Before word after", 7, 11);
    colorTarget(t.value, "#357ac2");
    expect(t.result()).toBe(
      'Before <span style="color: #357ac2">word</span> after',
    );
    const colored = t.result(),
      start = colored.indexOf("word");
    const u = target(colored, start, start + 4);
    colorTarget(u.value);
    expect(u.result()).toBe("Before word after");
  });
  it("wraps formatting and replaces paragraph markers", () => {
    const t = target("word");
    wrapTarget(t.value, "**");
    expect(t.result()).toBe("**word**");
    const u = target("- first\n- second");
    lineTarget(u.value, (i) => String(i + 1) + ". ");
    expect(u.result()).toBe("1. first\n2. second");
  });
  it("every editable format, paragraph and insertion leaf transforms text or launches its dialog", () => {
    const edits = ["Format", "Paragraph", "Insert"];
    let dialogs = 0;
    const options = {
      locked: false,
      lock: () => {},
      bookmarked: false,
      bookmark: () => {},
      link: () => {
        dialogs++;
      },
      table: () => {
        dialogs++;
      },
      search: () => {},
      error: () => {},
    };
    const template = editorItems(target("words").value, options);
    for (const group of template.filter((i) => edits.includes(i.label))) {
      for (const leaf of group.children ?? []) {
        if (leaf.children || ["Clear formatting"].includes(leaf.label))
          continue;
        const t = target("words");
        const action = editorItems(t.value, options)
          .find((i) => i.label === group.label)
          ?.children?.find((i) => i.label === leaf.label);
        const before = dialogs;
        action?.run?.();
        if (leaf.label !== "Body")
          expect(t.result() !== "words" || dialogs > before, leaf.label).toBe(
            true,
          );
      }
    }
  });
  it("disables edits while locked", () => {
    const menu = editorItems(null, {
      locked: true,
      lock: () => {},
      bookmarked: false,
      bookmark: () => {},
      link: () => {},
      table: () => {},
      search: () => {},
      error: () => {},
    });
    for (const label of ["Format", "Paragraph", "Insert", "Cut", "Paste"])
      expect(menu.find((i) => i.label === label)?.disabled).toBe(true);
  });
});
