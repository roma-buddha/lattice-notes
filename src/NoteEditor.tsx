import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { insertNewlineContinueMarkup, markdown } from "@codemirror/lang-markdown";
import { indentWithTab } from "@codemirror/commands";
import { EditorView, keymap, type EditorView as EditorViewInstance } from "@codemirror/view";
import { codeAlignment } from "./codeAlignment";
import { diagramEditing, noteIdentity } from "./diagramEditing";
import { livePreview } from "./livePreview";
import { codeTarget, wrapTarget } from "./editTarget";
import { tableColumnWidths, tableEditing, tableHighlights } from "./TableEditor";

export type NoteEditorAppearance = {
  highlights: number[];
  widths: Record<number, number[]>;
};

const baseExtensions = [
  markdown(),
  keymap.of([
    { key: "Enter", run: insertNewlineContinueMarkup },
    {
      key: "Mod-b",
      run: (view) => {
        wrapTarget(codeTarget(view), "**");
        return true;
      },
    },
    {
      key: "Mod-i",
      run: (view) => {
        wrapTarget(codeTarget(view), "*");
        return true;
      },
    },
    indentWithTab,
  ]),
  codeAlignment,
  tableEditing,
  diagramEditing,
  livePreview,
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ "aria-label": "Note editor" }),
];

export function NoteEditor({
  path,
  value,
  theme,
  identity,
  appearance,
  onCreateEditor,
  onChange,
}: {
  path: string;
  value: string;
  theme: "light" | "dark";
  identity: string;
  appearance: NoteEditorAppearance;
  onCreateEditor: (view: EditorViewInstance) => void;
  onChange: (body: string) => void;
}) {
  const extensions = useMemo(
    () => [
      ...baseExtensions,
      noteIdentity.of(identity),
      tableHighlights.of(appearance.highlights),
      tableColumnWidths.of(appearance.widths),
    ],
    [appearance.highlights, appearance.widths, identity],
  );

  return (
    <CodeMirror
      key={path}
      className="editor"
      onCreateEditor={onCreateEditor}
      value={value}
      theme={theme}
      extensions={extensions}
      onChange={onChange}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        highlightSelectionMatches: false,
      }}
    />
  );
}
