import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Ellipsis } from "lucide-react";
import { stem, type Entry } from "./notus";

import { anchorAt, type Anchor, type InlineEdit } from "./sidebarTypes";

const INITIAL_NOTE_ROWS = 250;
const NOTE_ROW_STEP = 250;
export function InlineName({
  value,
  error,
  working,
  onChange,
  onConfirm,
  onCancel,
}: {
  value: string;
  error: string;
  working: boolean;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
    ref.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return (
    <form
      className="inline-name"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirm();
      }}
    >
      <input
        ref={ref}
        aria-label="Name"
        aria-invalid={!!error}
        aria-describedby={error ? "inline-name-error" : undefined}
        value={value}
        disabled={working}
        maxLength={160}
        placeholder="Name…"
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      {error && (
        <span id="inline-name-error" className="inline-error" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
type Props = {
  entries: Entry[];
  selected: string;
  collapsed: Set<string>;
  query: string;
  depth?: number;
  parent?: string;
  onToggle: (path: string) => void;
  onSelect: (entry: Entry) => void;
  onMove: (source: string, parent: string) => void;
  onReorder: (source: string, parent: string, before: string | null) => void;
  onActions: (entry: Entry, anchor: Anchor) => void;
  inline: InlineEdit | null;
  editor: React.ReactNode;
  externalDropTarget?: string;
};
export function SidebarTree(props: Props) {
  const {
    entries,
    selected,
    collapsed,
    query,
    onToggle,
    onSelect,
    onMove,
    onReorder,
    onActions,
    inline,
    editor,
    externalDropTarget,
    depth = 0,
    parent = "",
  } = props;
  const [over, setOver] = useState("");
  const [insert, setInsert] = useState<{ path: string; before: boolean } | null>(null);
  const [noteRows, setNoteRows] = useState(INITIAL_NOTE_ROWS);
  const matches = (entry: Entry): boolean =>
    entry.name.toLowerCase().includes(query.toLowerCase()) ||
    entry.children.some(matches);
  return (
    <>
      {(() => {
        const matching = entries.filter(matches);
        // Folders stay visible, while a very large note folder is progressively
        // rendered. This bounds DOM work even for vaults with thousands of files.
        const folders = matching.filter((entry) => entry.kind !== "note");
        const notes = matching.filter((entry) => entry.kind === "note");
        const shown = query ? matching : [...folders, ...notes.slice(0, noteRows)];
        return shown.map((entry) => {
        const folder = entry.kind !== "note";
        const open = !collapsed.has(entry.path) || !!query;
        const renaming =
          inline?.kind === "rename" && inline.entry.path === entry.path;
        return (
          <div
            key={entry.path}
            className={entry.kind === "vault" ? "vault-group" : "folder-group"}
          >
            <div
              data-path={entry.path}
              className={`tree-row kind-${entry.kind} ${selected === entry.path ? "selected" : ""} ${over === entry.path || externalDropTarget === entry.path ? "drop-target" : ""} ${insert?.path === entry.path ? (insert.before ? "drop-insert-before" : "drop-insert-after") : ""}`}
              style={{ paddingLeft: 6 + depth * 16 }}
              draggable={entry.kind !== "vault" && !inline}
              onContextMenu={(event) => {
                if ((event.target as HTMLElement).closest("input")) return;
                event.preventDefault();
                const trigger =
                  event.currentTarget.querySelector<HTMLElement>(
                    ".row-actions",
                  )!;
                onActions(entry, anchorAt(trigger));
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                ) {
                  event.preventDefault();
                  onActions(
                    entry,
                    anchorAt(
                      event.currentTarget.querySelector<HTMLElement>(
                        ".row-actions",
                      )!,
                    ),
                  );
                }
              }}
              onDragStart={(event) => {
                const payload = JSON.stringify({ path: entry.path, kind: entry.kind });
                event.dataTransfer.setData("application/x-lotus-note", payload);
                event.dataTransfer.setData("text/notus-path", entry.path);
                event.dataTransfer.setData("text/notus-kind", entry.kind);
                event.dataTransfer.setData(`notus-${entry.kind}`, "1");
                event.dataTransfer.setData("text/plain", payload);
                event.dataTransfer.effectAllowed = "copyMove";
              }}
              onDragOver={(event) => {
                const kind = event.dataTransfer.getData("text/notus-kind");
                const noteDrag = kind === "note" || event.dataTransfer.types.includes("notus-note") || event.dataTransfer.types.includes("application/x-lotus-note");
                if (entry.kind === "note" && noteDrag) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setInsert({ path: entry.path, before: event.clientY < event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2 });
                  setOver("");
                  return;
                }
                if (
                  ((entry.kind === "folder" &&
                    event.dataTransfer.types.includes("notus-note")) ||
                    (entry.kind === "vault" &&
                      event.dataTransfer.types.includes("notus-folder"))) &&
                  event.dataTransfer.types.includes("text/notus-path")
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(entry.path);
                }
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  setOver("");
                  setInsert((current) => current?.path === entry.path ? null : current);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOver("");
                const path = event.dataTransfer.getData("text/notus-path");
                const kind = event.dataTransfer.getData("text/notus-kind");
                if (entry.kind === "note" && kind === "note" && path) {
                  const current = insert;
                  const notes = matching.filter((candidate) => candidate.kind === "note");
                  const index = notes.findIndex((candidate) => candidate.path === entry.path);
                  const before = current?.before ? entry.path : notes[index + 1]?.path ?? null;
                  setInsert(null);
                  onReorder(path, parent, before);
                  return;
                }
                setInsert(null);
                if (
                  path &&
                  ((entry.kind === "folder" && kind === "note") ||
                    (entry.kind === "vault" && kind === "folder"))
                )
                  onMove(path, entry.path);
              }}
            >
              {folder ? (
                <button
                  className="twisty"
                  aria-label={`${open ? "Collapse" : "Expand"} ${entry.name}`}
                  aria-expanded={open}
                  onClick={() => onToggle(entry.path)}
                >
                  {open ? (
                    <ChevronDown size={13} />
                  ) : (
                    <ChevronRight size={13} />
                  )}
                </button>
              ) : (
                <span className="twisty-spacer" />
              )}
              {renaming ? (
                editor
              ) : (
                <>
                  <button
                    className="tree-select"
                    title={entry.path}
                    aria-current={selected === entry.path ? "page" : undefined}
                    onClick={() => onSelect(entry)}
                  >
                    <span>
                      {entry.kind === "note" ? stem(entry.name) : entry.name}
                    </span>
                  </button>
                  <button
                    className="row-actions"
                    aria-label={`Actions for ${entry.name}`}
                    aria-haspopup="menu"
                    onClick={(event) =>
                      onActions(entry, anchorAt(event.currentTarget))
                    }
                  >
                    <Ellipsis size={15} />
                  </button>
                </>
              )}
            </div>
            {folder && open && (
              <SidebarTree
                {...props}
                entries={entry.children}
                depth={depth + 1}
                parent={entry.path}
              />
            )}
          </div>
        );
        });
      })()}
      {!query && entries.filter(matches).filter((entry) => entry.kind === "note").length > noteRows && (
        <button
          className="tree-show-more"
          type="button"
          onClick={() => setNoteRows((count) => count + NOTE_ROW_STEP)}
        >
          Show {Math.min(NOTE_ROW_STEP, entries.filter(matches).filter((entry) => entry.kind === "note").length - noteRows)} more notes
        </button>
      )}
      {inline?.kind === "create" && inline.parent === parent && (
        <div
          className={`tree-row temporary-row kind-${inline.entryKind}`}
          style={{ paddingLeft: 6 + depth * 16 }}
        >
          <span className="creation-twisty">
            {inline.entryKind === "folder" ? <ChevronRight size={14} /> : null}
          </span>
          {editor}
        </div>
      )}
    </>
  );
}
