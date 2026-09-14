import { isolateHistory } from "@codemirror/commands";
import { parser, GFM } from "@lezer/markdown";
import type { EditorView } from "@codemirror/view";
export type EditTarget = {
  kind?: "cell";
  text: string;
  from: number;
  to: number;
  replace: (
    from: number,
    to: number,
    text: string,
    selection?: { anchor: number; head: number },
  ) => void;
  selectAll: () => void;
};

type ViewportAnchor = {
  scroll: HTMLElement;
  position: number;
  y: number;
};

function captureViewportAnchor(view: EditorView): ViewportAnchor | null {
  const scroll = view.dom.closest<HTMLElement>(".document-scroll");
  if (!scroll) return null;

  const bounds = scroll.getBoundingClientRect();
  const content = view.contentDOM.getBoundingClientRect();
  const position = view.posAtCoords(
    {
      x: Math.max(bounds.left + 20, content.left + 4),
      y: bounds.top + 12,
    },
    false,
  );
  if (position === null) return null;

  const y = view.coordsAtPos(position)?.top;
  return y === undefined ? null : { scroll, position, y };
}

function mapPosition(
  position: number,
  from: number,
  to: number,
  inserted: number,
) {
  if (position <= from) return position;
  if (position >= to) return position + inserted - (to - from);
  return from + inserted;
}

function restoreViewportAnchor(
  view: EditorView,
  anchor: ViewportAnchor | null,
  from: number,
  to: number,
  inserted: number,
) {
  if (!anchor) return;
  const position = mapPosition(anchor.position, from, to, inserted);
  const restore = () => {
    if (!view.dom.isConnected || position > view.state.doc.length) return;
    view.requestMeasure({
      read: () => view.coordsAtPos(position)?.top,
      write: (nextY) => {
        if (nextY !== undefined) anchor.scroll.scrollTop += nextY - anchor.y;
      },
    });
  };

  // The controlled editor receives the new draft after the menu command.
  // Wait for that render before measuring, then repeat once for live-preview
  // decorations that settle on the following frame.
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
}

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
  const viewportAnchor = captureViewportAnchor(view);
  return {
    text: view.state.doc.toString(),
    from,
    to,
    replace: (start, end, text, selection) => {
      view.dispatch({
        changes: { from: start, to: end, insert: text },
        selection: selection ?? { anchor: start, head: start + text.length },
        userEvent: "input.format",
        annotations: isolateHistory.of("full"),
      });
      view.focus();
      restoreViewportAnchor(view, viewportAnchor, start, end, text.length);
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
    replace: (from, to, text, selection) => {
      input.value = input.value.slice(0, from) + text + input.value.slice(to);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.setSelectionRange(
        selection?.anchor ?? from,
        selection?.head ?? from + text.length,
      );
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
  const firstPrefix = typeof prefix === "function" ? prefix(0) : prefix;
  const firstBody = target.text
    .slice(from, to)
    .split("\n")[0]
    .replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[[ x]\]\s+)?|\d+\.\s+|>\s*)/, "");
  const anchor = from + firstPrefix.length;
  target.replace(from, to, text, {
    anchor,
    // Preserve the list marker while keeping an existing first item ready to
    // replace. An empty line becomes a normal caret after the marker.
    head: anchor + firstBody.length,
  });
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
