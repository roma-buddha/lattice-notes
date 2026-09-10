// Only explicitly supported inline syntax is rendered. User HTML is never injected.
export const palette = [
  ["Red", "#c44f59"],
  ["Orange", "#b76829"],
  ["Yellow", "#947b18"],
  ["Green", "#398251"],
  ["Blue", "#357ac2"],
  ["Purple", "#8760bc"],
  ["Pink", "#b34f8a"],
] as const;
export function displayColor(color: string) {
  const entry = palette.find(([, hex]) => hex === color.toLowerCase());
  return entry
    ? `var(--lotus-color-${entry[0].toLowerCase()}, ${color})`
    : color;
}
export function inlineContent(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  const token =
    /<span\s+style=['"]color:\s*(#[\da-f]{6})\s*;?['"]>([\s\S]*?)<\/span>|\[([^\]]+)\]\(([^)]+)\)|\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|(\*\*\*|\*\*|~~|==|\x60|\*)(.+?)\7/g;
  let last = 0;
  for (const match of text.matchAll(token)) {
    fragment.append(document.createTextNode(text.slice(last, match.index)));
    let el: HTMLElement;
    if (match[1]) {
      el = document.createElement("span");
      el.style.color = displayColor(match[1]);
      el.append(inlineContent(match[2]));
    } else if (match[3] || match[5]) {
      el = document.createElement("a");
      el.textContent = match[3] || match[6] || match[5];
      el.dataset.noteHref = match[4] || match[5];
      (el as HTMLAnchorElement).href = "#";
    } else {
      el = document.createElement(
        match[7] === "***" || match[7] === "**"
          ? "strong"
          : match[7] === "*"
            ? "em"
            : match[7] === "~~"
              ? "del"
              : match[7] === "=="
                ? "mark"
                : "code",
      );
      if (match[7] === "***") {
        const italic = document.createElement("em");
        italic.append(inlineContent(match[8]));
        el.append(italic);
      } else if (match[7] === "`") el.textContent = match[8];
      else el.append(inlineContent(match[8]));
    }
    fragment.append(el);
    last = match.index! + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(last)));
  return fragment;
}
