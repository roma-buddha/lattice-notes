import { useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Ellipsis,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { stem, type Entry } from "./notus";

import { anchorAt, type Anchor, type InlineEdit } from "./sidebarTypes";
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
      <span className="inline-hint">
        {working ? "Saving…" : "Enter to save · Esc to cancel"}
      </span>
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
  onActions: (entry: Entry, anchor: Anchor) => void;
  inline: InlineEdit | null;
  editor: React.ReactNode;
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
    onActions,
    inline,
    editor,
    depth = 0,
    parent = "",
  } = props;
  const [over, setOver] = useState("");
  const matches = (entry: Entry): boolean =>
    entry.name.toLowerCase().includes(query.toLowerCase()) ||
    entry.children.some(matches);
  return (
    <>
      {entries.filter(matches).map((entry) => {
        const folder = entry.kind !== "note";
        const open = !collapsed.has(entry.path) || !!query;
        const renaming =
          inline?.kind === "rename" && inline.entry.path === entry.path;
        return (
          <div key={entry.path} className={depth === 0 ? "vault-group" : ""}>
            <div
              data-path={entry.path}
              className={`tree-row ${selected === entry.path ? "selected" : ""} ${over === entry.path ? "drop-target" : ""}`}
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
                event.dataTransfer.setData("text/notus-path", entry.path);
                event.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(event) => {
                if (
                  folder &&
                  event.dataTransfer.types.includes("text/notus-path")
                ) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(entry.path);
                }
              }}
              onDragLeave={() => setOver("")}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setOver("");
                const path = event.dataTransfer.getData("text/notus-path");
                if (folder && path) onMove(path, entry.path);
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
                    {entry.kind === "vault" ? (
                      <BookOpen size={16} />
                    ) : folder ? (
                      open ? (
                        <FolderOpen size={15} />
                      ) : (
                        <Folder size={15} />
                      )
                    ) : (
                      <FileText size={15} />
                    )}
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
      })}
      {inline?.kind === "create" && inline.parent === parent && (
        <div
          className="tree-row temporary-row"
          style={{ paddingLeft: 25 + depth * 16 }}
        >
          {inline.entryKind === "note" ? (
            <FileText size={15} />
          ) : (
            <Folder size={15} />
          )}
          {editor}
        </div>
      )}
    </>
  );
}
