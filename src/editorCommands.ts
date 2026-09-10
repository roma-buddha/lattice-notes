import type { EditorView } from "@codemirror/view";

export function wrapSelection(view: EditorView, before: string, after = before) {
  const selection = view.state.selection.main;
  const text = view.state.sliceDoc(selection.from, selection.to) || "text";
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: before + text + after },
    selection: { anchor: selection.from + before.length, head: selection.from + before.length + text.length },
    userEvent: "input.format",
  });
  view.focus();
}

export function prefixLines(view: EditorView, prefix: string | ((index: number) => string)) {
  const selection = view.state.selection.main;
  const first = view.state.doc.lineAt(selection.from);
  const last = view.state.doc.lineAt(selection.to);
  const changes = [];
  for (let number = first.number, index = 0; number <= last.number; number++, index++) {
    const line = view.state.doc.line(number);
    changes.push({ from: line.from, insert: typeof prefix === "function" ? prefix(index) : prefix });
  }
  view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}

export function setHeading(view: EditorView, level: number) {
  const selection = view.state.selection.main;
  const first = view.state.doc.lineAt(selection.from);
  const last = view.state.doc.lineAt(selection.to);
  const changes = [];
  for (let number = first.number; number <= last.number; number++) {
    const line = view.state.doc.line(number);
    const marker = line.text.match(/^#{1,6}\s+/)?.[0] ?? "";
    changes.push({ from: line.from, to: line.from + marker.length, insert: level ? "#".repeat(level) + " " : "" });
  }
  view.dispatch({ changes, userEvent: "input.format" });
  view.focus();
}
