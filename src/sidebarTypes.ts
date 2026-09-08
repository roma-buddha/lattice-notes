import type { Entry } from "./notus";
export type InlineEdit =
  | { kind: "create"; parent: string; entryKind: Entry["kind"] }
  | { kind: "rename"; entry: Entry };
export type Anchor = { x: number; y: number; trigger: HTMLElement };
export function anchorAt(trigger: HTMLElement): Anchor {
  const rect = trigger.getBoundingClientRect();
  return { x: rect.right + 4, y: rect.top, trigger };
}
