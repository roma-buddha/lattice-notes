type Node = {
  type: string;
  value?: string;
  url?: string;
  children?: Node[];
  data?: { hName?: string; hProperties?: Record<string, unknown> };
};
// Extends rendering only; the file remains ordinary Markdown with portable extensions.
export function remarkExtras() {
  return (tree: Node) => {
    const visit = (node: Node) => {
      if (node.type === "blockquote") {
        const text = node.children?.[0]?.children?.[0];
        const match = text?.value?.match(
          /^\[!([\w-]+)\][+-]?[ \t]*([^\n]*)(?:\n|$)/,
        );
        if (match && text && node.children) {
          node.data = { hProperties: { className: ["lotus-callout"] } };
          text.value = (text.value ?? "").slice(match[0].length);
          const first = node.children[0];
          const title: Node = {
            type: "paragraph",
            data: { hProperties: { className: ["callout-title"] } },
            children: [{ type: "text", value: "✎ " + (match[2] || match[1]) }],
          };
          const hasBody = first.children?.some(
            (child) => child.type !== "text" || !!child.value,
          );
          node.children = [
            title,
            ...(hasBody ? [first] : []),
            ...node.children.slice(1),
          ];
        }
      }
      if (
        !node.children ||
        ["code", "inlineCode", "html", "link"].includes(node.type)
      )
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") {
          visit(child);
          return [child];
        }
        const text = child.value ?? "",
          parts: Node[] = [];
        let last = 0;
        for (const match of text.matchAll(
          /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|==(.+?)==|%%(.+?)%%/g,
        )) {
          if (match.index! > last)
            parts.push({ type: "text", value: text.slice(last, match.index) });
          if (match[1])
            parts.push({
              type: "link",
              url: match[1],
              children: [{ type: "text", value: match[2] || match[1] }],
            });
          else if (match[3])
            parts.push({
              type: "emphasis",
              data: { hName: "mark" },
              children: [{ type: "text", value: match[3] }],
            });
          last = match.index! + match[0].length;
        }
        if (last < text.length)
          parts.push({ type: "text", value: text.slice(last) });
        return parts.length ? parts : [{ type: "text", value: "" }];
      });
    };
    visit(tree);
  };
}
