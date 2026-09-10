import { isolateHistory } from "@codemirror/commands";
import { parser, GFM } from "@lezer/markdown";
import type { EditorView } from "@codemirror/view";
export type EditTarget = {
  kind?: "cell";
  text: string;
  from: number;
  to: number;
  replace: (from: number, to: number, text: string) => void;
  selectAll: () => void;
};
export function readTarget(element: HTMLElement): EditTarget {
  const text = window.getSelection()?.toString() ?? "";
  return {
    text,
    from: 0,
    to: text.length,
    replace: () => {},
    selectAll: () => {
      const range = document.createRange();
      range.selectNodeContents(element.querySelector(".reading") ?? element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
  };
}
export function codeTarget(view: EditorView): EditTarget {
  const { from, to } = view.state.selection.main;
  const scroll = view.dom.closest<HTMLElement>(".document-scroll");
  const top = scroll?.scrollTop ?? 0;
  const lineStart = view.state.doc.lineAt(from).from;
  const y = view.coordsAtPos(lineStart)?.top;
  return {
    text: view.state.doc.toString(),
    from,
    to,
    replace: (start, end, text) => {
      view.dispatch({
        changes: { from: start, to: end, insert: text },
        selection: { anchor: start, head: start + text.length },
        userEvent: "input.format",
        annotations: isolateHistory.of("full"),
      });
      view.focus();
      if (scroll) {
        scroll.scrollTop = top;
        view.requestMeasure({
          read: () =>
            view.coordsAtPos(Math.min(lineStart, view.state.doc.length))?.top,
          write: (nextY) => {
            scroll.scrollTop += y !== undefined && nextY !== undefined ? nextY - y : 0;
            requestAnimationFrame(() => {
              const settled = view.coordsAtPos(Math.min(lineStart, view.state.doc.length))?.top;
              if (y !== undefined && settled !== undefined) scroll.scrollTop += settled - y;
            });
          },
        });
      }
    },
    selectAll: () => {
      view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
      view.focus();
    },
  };
}
export function inputTarget(input: HTMLTextAreaElement): EditTarget {
  return {
    kind: "cell",
    text: input.value,
    from: input.selectionStart,
    to: input.selectionEnd,
    replace: (from, to, text) => {
      input.value = input.value.slice(0, from) + text + input.value.slice(to);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.setSelectionRange(from, from + text.length);
    },
    selectAll: () => {
      input.focus();
      input.select();
    },
  };
}
export function wrapTarget(target: EditTarget, before: string, after = before) {
  const selected = target.text.slice(target.from, target.to);
  if (["**", "*", "~~", "`"].includes(before) && before === after) {
    const names: Record<string, string> = {
      "**": "StrongEmphasis",
      "*": "Emphasis",
      "~~": "Strikethrough",
      "`": "InlineCode",
    };
    let containing:
      | { from: number; to: number; innerFrom: number; innerTo: number }
      | undefined;
    let found:
      | { from: number; to: number; innerFrom: number; innerTo: number }
      | undefined;
    parser
      .configure(GFM)
      .parse(target.text)
      .iterate({
        enter(node) {
          if (node.name !== names[before]) return;
          const first = node.node.firstChild,
            last = node.node.lastChild;
          if (
            first &&
            last &&
            first.to <= target.from &&
            last.from >= target.to
          )
            containing = {
              from: node.from,
              to: node.to,
              innerFrom: first.to,
              innerTo: last.from,
            };
          if (
            first &&
            last &&
            node.from <= target.from &&
            node.to >= target.to &&
            /^[*_~`=]*$/.test(
              target.text.slice(first.to, Math.max(first.to, target.from)),
            ) &&
            /^[*_~`=]*$/.test(
              target.text.slice(Math.min(last.from, target.to), last.from),
            )
          )
            found = {
              from: node.from,
              to: node.to,
              innerFrom: first.to,
              innerTo: last.from,
            };
        },
      });
    if (found) {
      target.replace(
        found.from,
        found.to,
        target.text.slice(found.innerFrom, found.innerTo),
      );
      return;
    }
    if (containing && target.to > target.from) {
      const wrapPart = (part: string) =>
        part.replace(
          /^(\s*)([\s\S]*?)(\s*)$/,
          (_all, leading, body, trailing) =>
            leading + (body ? before + body + after : "") + trailing,
        );
      target.replace(
        containing.from,
        containing.to,
        wrapPart(target.text.slice(containing.innerFrom, target.from)) +
          selected +
          wrapPart(target.text.slice(target.to, containing.innerTo)),
      );
      return;
    }
    target.replace(
      target.from,
      target.to,
      before + (selected || "text") + after,
    );
    return;
  }
  if (
    selected.startsWith(before) &&
    selected.endsWith(after) &&
    selected.length >= before.length + after.length
  ) {
    target.replace(
      target.from,
      target.to,
      selected.slice(before.length, selected.length - after.length),
    );
    return;
  }
  if (
    target.text.slice(Math.max(0, target.from - before.length), target.from) ===
      before &&
    target.text.slice(target.to, target.to + after.length) === after
  ) {
    target.replace(
      target.from - before.length,
      target.to + after.length,
      selected,
    );
    return;
  }
  target.replace(
    target.from,
    target.to,
    before + (target.text.slice(target.from, target.to) || "text") + after,
  );
}
export function clearTarget(target: EditTarget) {
  let { from, to } = target;
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const marker of ["**", "~~", "==", "%%", "\x60", "*", "_"]) {
      if (
        from >= marker.length &&
        target.text.slice(from - marker.length, from) === marker &&
        target.text.slice(to, to + marker.length) === marker
      ) {
        from -= marker.length;
        to += marker.length;
        expanded = true;
        break;
      }
    }
    const span = target.text
      .slice(0, from)
      .match(/<span\s+style=['"]color:\s*#[\da-f]{6}\s*;?['"]>$/i);
    if (span && target.text.slice(to, to + 7) === "</span>") {
      from -= span[0].length;
      to += 7;
      expanded = true;
    }
  }
  let text = target.text
    .slice(from, to)
    .replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, "$1");
  let previous;
  do {
    previous = text;
    text = text.replace(/(\*\*|~~|==|%%|\x60|\*|_)(.*?)\1/g, "$2");
  } while (text !== previous);
  target.replace(from, to, text);
}
export function colorTarget(target: EditTarget, color?: string) {
  let { from, to } = target;
  const open = target.text
    .slice(0, from)
    .match(/<span\s+style=['"]color:\s*#[\da-f]{6}\s*;?['"]>$/i);
  if (open && target.text.slice(to).startsWith("</span>")) {
    from -= open[0].length;
    to += 7;
  }
  const text = target.text
    .slice(from, to)
    .replace(
      /<span\s+style=['"]color:\s*#[\da-f]{6}\s*;?['"]>([\s\S]*?)<\/span>/gi,
      "$1",
    );
  target.replace(
    from,
    to,
    color ? `<span style="color: ${color}">${text || "text"}</span>` : text,
  );
}
export function lineTarget(
  target: EditTarget,
  prefix: string | ((i: number) => string),
) {
  const from = target.text.lastIndexOf("\n", Math.max(0, target.from - 1)) + 1;
  // A selection ending at the beginning of the next line doesn't include it.
  const end = target.text.indexOf(
    "\n",
    target.to > target.from && target.text[target.to - 1] === "\n"
      ? target.to - 1
      : target.to,
  );
  const to = end < 0 ? target.text.length : end;
  const text = target.text
    .slice(from, to)
    .split("\n")
    .map(
      (line, i) =>
        (typeof prefix === "function" ? prefix(i) : prefix) +
        line.replace(
          /^(?:#{1,6}\s+|[-*+]\s+(?:\[[ x]\]\s+)?|\d+\.\s+|>\s*)/,
          "",
        ),
    )
    .join("\n");
  target.replace(from, to, text);
}

export function blockTarget(
  target: EditTarget,
  kind: "rule" | "code" | "math" | "callout",
) {
  const selected = target.text.slice(target.from, target.to);
  const prefix =
    target.from > 0
      ? target.text[target.from - 1] === "\n"
        ? "\n"
        : "\n\n"
      : "";
  const suffix =
    target.to < target.text.length
      ? target.text[target.to] === "\n"
        ? "\n"
        : "\n\n"
      : "\n";
  const body =
    kind === "rule"
      ? selected
        ? selected + "\n\n---"
        : "---"
      : kind === "callout"
        ? "> [!NOTE]\n" +
          (selected || "Note")
            .split("\n")
            .map((line) => "> " + line)
            .join("\n")
        : kind === "code"
          ? "```\n" + (selected || "code") + "\n```"
          : "$$\n" + (selected || "x") + "\n$$";
  target.replace(target.from, target.to, prefix + body + suffix);
}
