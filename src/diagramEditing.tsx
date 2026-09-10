import { Facet, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { createRoot, type Root } from "react-dom/client";
import { MermaidDiagram } from "./MermaidDiagram";
export const noteIdentity = Facet.define<string, string>({
  combine: (values) => values[0] ?? "note",
});
type Diagram = {
  from: number;
  to: number;
  source: string;
  fence: string;
  index: number;
};
const mounted = new WeakMap<
  HTMLElement,
  { root: Root; view: EditorView; model: Diagram }
>();
class DiagramWidget extends WidgetType {
  constructor(
    readonly model: Diagram,
    readonly identity: string,
  ) {
    super();
  }
  toDOM(view: EditorView) {
    const el = document.createElement("div");
    el.className = "diagram-widget";
    const root = createRoot(el);
    mounted.set(el, { root, view, model: this.model });
    this.render(el);
    return el;
  }
  render(el: HTMLElement) {
    const ctx = mounted.get(el)!;
    ctx.root.render(
      <MermaidDiagram
        source={ctx.model.source}
        preferenceKey={`${this.identity}:${ctx.model.index}`}
        onChange={(source) => {
          const { model, view } = ctx;
          view.dispatch({
            changes: {
              from: model.from,
              to: model.to,
              insert: `${model.fence}mermaid\n${source.trimEnd()}\n${model.fence}`,
            },
            userEvent: "input.diagram",
          });
        }}
      />,
    );
  }
  updateDOM(el: HTMLElement, view: EditorView) {
    const ctx = mounted.get(el);
    if (!ctx) return false;
    ctx.model = this.model;
    ctx.view = view;
    this.render(el);
    return true;
  }
  destroy(el: HTMLElement) {
    const ctx = mounted.get(el);
    queueMicrotask(() => ctx?.root.unmount());
    mounted.delete(el);
  }
  ignoreEvent() {
    return true;
  }
}
function build(text: string, identity: string) {
  const widgets = [];
  let index = 0;
  for (const m of text.matchAll(
    /^(`{3,}|~{3,})mermaid[^\S\n]*\r?\n([\s\S]*?)^\1[^\S\n]*$/gm,
  )) {
    const model = {
      from: m.index!,
      to: m.index! + m[0].length,
      source: m[2],
      fence: m[1],
      index: index++,
    };
    widgets.push(
      Decoration.replace({
        widget: new DiagramWidget(model, identity),
        block: true,
      }).range(model.from, model.to),
    );
  }
  return Decoration.set(widgets);
}
export const diagramEditing = StateField.define<DecorationSet>({
  create: (state) => build(state.doc.toString(), state.facet(noteIdentity)),
  update: (value, tr) =>
    tr.docChanged
      ? build(tr.state.doc.toString(), tr.state.facet(noteIdentity))
      : value,
  provide: (field) => EditorView.decorations.from(field),
});
