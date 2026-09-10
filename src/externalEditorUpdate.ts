import { ExternalChange } from "@uiw/react-codemirror";
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
/** Apply the smallest external change without turning the current selection into Select all. */
export function externalEditorUpdate(view: EditorView | null, text: string) {
  if (!view || !view.dom.isConnected) return;
  const old = view.state.doc.toString();
  if (old === text) return;
  let from = 0,
    end = old.length,
    newEnd = text.length;
  while (from < end && from < newEnd && old[from] === text[from]) from++;
  while (end > from && newEnd > from && old[end - 1] === text[newEnd - 1]) {
    end--;
    newEnd--;
  }
  const map = (pos: number) =>
    pos <= from ? pos : pos >= end ? pos + newEnd - end : Math.min(pos, newEnd);
  const selection = view.state.selection.main;
  view.dispatch({
    changes: { from, to: end, insert: text.slice(from, newEnd) },
    selection: { anchor: map(selection.anchor), head: map(selection.head) },
    annotations: [ExternalChange.of(true), Transaction.addToHistory.of(false)],
  });
}
