import { syntaxTree } from "@codemirror/language";
import { Decoration, EditorView } from "@codemirror/view";
// Paragraph alignment must never rearrange source-code indentation.
export const codeAlignment = EditorView.decorations.compute(
  ["doc"],
  (state) => {
    const lines = new Set<number>();
    syntaxTree(state).iterate({
      enter(node) {
        if (node.name === "FencedCode" || node.name === "CodeBlock") {
          let line = state.doc.lineAt(node.from);
          while (line.from < node.to) {
            lines.add(line.from);
            if (line.number === state.doc.lines) break;
            line = state.doc.line(line.number + 1);
          }
          return false;
        }
      },
    });
    for (let i = 1; i <= state.doc.lines; i++) {
      const line = state.doc.line(i);
      if (/[A-Za-z]:\\|file:\/\/|(?:https?:\/\/|www\.)\S{40}/.test(line.text))
        lines.add(line.from);
    }
    return Decoration.set(
      [...lines]
        .sort((a, b) => a - b)
        .map((from) =>
          Decoration.line({ attributes: { class: "code-aligned-left" } }).range(
            from,
          ),
        ),
    );
  },
);
