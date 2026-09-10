import { externalMoves } from "./core/fileChanges";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
} from "lucide-react";
import { anchorAt, type Anchor } from "./sidebarTypes";
import { AreaIcon, AreaIconPicker } from "./AreaIcons";
import { parentOf, stem, type Entry, type OrganizerState } from "./notus";

export function WorkspaceOrganizer({
  entries,
  state,
  update,
  move,
  open,
  actions,
  createVault,
}: {
  createVault: () => void;
  entries: Entry[];
  state: OrganizerState;
  update: (value: OrganizerState) => Promise<void>;
  move: (source: string, parent: string) => Promise<void>;
  open: (path: string) => Promise<void>;
  actions: (entry: Entry, anchor: Anchor) => void;
}) {
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const previousEntries = useRef(entries);
  useEffect(() => {
    const moves = externalMoves(previousEntries.current, entries);
    previousEntries.current = entries;
    if (moves.size)
      setExpanded(
        (previous) => new Set([...previous].map((p) => moves.get(p) ?? p)),
      );
  }, [entries]);
  const toggle = (path: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  const [icon, setIcon] = useState("briefcase");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [over, setOver] = useState("");
  const [query, setQuery] = useState("");
  const [undo, setUndo] = useState<{ source: string; parent: string } | null>(
    null,
  );
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const relocate = async (source: string, parent: string) => {
    if (parentOf(source) === parent) return;
    await move(source, parent);
    setUndo({
      source: `${parent}/${source.split("/").at(-1)!}`,
      parent: parentOf(source),
    });
    setMessage("Note moved.");
  };
  const matches = (e: Entry): boolean =>
    e.name.toLowerCase().includes(query.toLowerCase()) ||
    e.children.some(matches);
  return (
    <section
      className="organizer compact-organizer"
      aria-label="Workspace organizer"
      aria-busy={busy}
    >
      <div className="organizer-content">
        <h1>Organize workspace</h1>
        <section
          className="area-management organizer-section"
          aria-label="Manage areas"
        >
          <header>
            <h2>Areas</h2>
            <button
              disabled={busy}
              onClick={() => {
                setForm(true);
                setEditing(null);
                setName("");
                setIcon("briefcase");
              }}
            >
              <Plus size={15} />
              Create area
            </button>
          </header>
          {form && (
            <form
              className="area-form"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  const area = {
                    id: editing ?? crypto.randomUUID(),
                    name: name.trim(),
                    icon,
                  };
                  await update({
                    ...state,
                    areas: editing
                      ? state.areas.map((a) => (a.id === editing ? area : a))
                      : [...state.areas, area],
                  });
                  setForm(false);
                });
              }}
            >
              <label>
                Area name
                <input
                  autoFocus
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <AreaIconPicker value={icon} onChange={setIcon} />
              <button disabled={busy}>
                {editing ? "Save area" : "Create area"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(false)}
              >
                Cancel
              </button>
              {editing && (
                <button
                  className="danger"
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await update({
                        ...state,
                        areas: state.areas.filter((a) => a.id !== editing),
                        assignments: Object.fromEntries(
                          Object.entries(state.assignments).filter(
                            ([, id]) => id !== editing,
                          ),
                        ),
                      });
                      setForm(false);
                      setMessage(
                        "Area removed; its vaults are now Uncategorized. Files are unchanged.",
                      );
                    })
                  }
                >
                  Remove label only
                </button>
              )}
            </form>
          )}
          <ul className="area-list">
            {state.areas.map((area) => (
              <li key={area.id}>
                <AreaIcon icon={area.icon} />
                <span>{area.name}</span>
                <small>
                  {
                    Object.values(state.assignments).filter(
                      (id) => id === area.id,
                    ).length
                  }{" "}
                  vaults
                </small>
                <button
                  disabled={busy}
                  className="icon"
                  aria-label={`Edit area ${area.name}`}
                  onClick={() => {
                    setEditing(area.id);
                    setName(area.name);
                    setIcon(area.icon);
                    setForm(true);
                  }}
                >
                  <Pencil size={14} />
                </button>
              </li>
            ))}
          </ul>
          {!state.areas.length && (
            <p className="muted">
              Create an area, then choose it when creating or adding a vault.
            </p>
          )}
        </section>
        <section
          className="files-management organizer-section"
          aria-label="Organize files"
        >
          <input
            className="organizer-search"
            aria-label="Filter organizer"
            placeholder="Find a vault, folder or note…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <header className="explorer-heading">
            <h2>Files</h2>
            <button
              className="icon"
              aria-label="Expand all"
              title="Expand all"
              onClick={() =>
                setExpanded(
                  new Set(
                    entries.flatMap((v) => [
                      v.path,
                      ...v.children.map((f) => f.path),
                    ]),
                  ),
                )
              }
            >
              <ChevronsUpDown size={16} />
            </button>
            <button
              className="icon"
              aria-label="Collapse all"
              title="Collapse all"
              onClick={() => setExpanded(new Set())}
            >
              <ChevronsDownUp size={16} />
            </button>
            <button onClick={createVault}>
              <Plus size={15} />
              Create vault
            </button>
          </header>
          {error && (
            <p role="alert" className="dialog-error">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
          {undo && (
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await move(undo.source, undo.parent);
                  setUndo(null);
                  setMessage("Move undone.");
                })
              }
            >
              Undo last move
            </button>
          )}
          <div
            className="organizer-tree"
            aria-label="All vaults, folders and notes"
          >
            {entries.filter(matches).map((vault) => (
              <details
                open={!!query || expanded.has(vault.path)}
                className="explorer-vault"
                key={vault.path}
              >
                <summary
                  onClick={(e) => {
                    e.preventDefault();
                    toggle(vault.path);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    actions(vault, {
                      ...anchorAt(e.currentTarget),
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                >
                  <AreaIcon
                    icon={
                      state.areas.find(
                        (a) => a.id === state.assignments[vault.path],
                      )?.icon
                    }
                  />
                  <strong>{vault.name}</strong>
                  <small>
                    {state.areas.find(
                      (a) => a.id === state.assignments[vault.path],
                    )?.name ?? "Uncategorized"}
                  </small>
                  <button
                    className="icon organizer-actions"
                    aria-label={`Actions for ${vault.name}`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      actions(vault, anchorAt(e.currentTarget));
                    }}
                  >
                    <Ellipsis size={15} />
                  </button>
                </summary>
                {vault.children
                  .filter(
                    (f) =>
                      vault.name.toLowerCase().includes(query.toLowerCase()) ||
                      matches(f),
                  )
                  .map((folder) => (
                    <details
                      open={!!query || expanded.has(folder.path)}
                      key={folder.path}
                      data-folder={folder.path}
                      className={`explorer-folder ${over === folder.path ? "drop-target" : ""}`}
                      onDragOver={(e) => {
                        if (
                          !busy &&
                          e.dataTransfer.types.includes("notus-note")
                        ) {
                          e.preventDefault();
                          e.stopPropagation();
                          e.dataTransfer.dropEffect = "move";
                          setOver(folder.path);
                        }
                      }}
                      onDragLeave={(e) => {
                        if (
                          !e.currentTarget.contains(
                            e.relatedTarget as Node | null,
                          )
                        )
                          setOver("");
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOver("");
                        if (
                          e.dataTransfer.getData("text/notus-kind") === "note"
                        )
                          void run(() =>
                            relocate(
                              e.dataTransfer.getData("text/notus-path"),
                              folder.path,
                            ),
                          );
                      }}
                    >
                      <summary
                        onClick={(e) => {
                          e.preventDefault();
                          toggle(folder.path);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          actions(folder, {
                            ...anchorAt(e.currentTarget),
                            x: e.clientX,
                            y: e.clientY,
                          });
                        }}
                      >
                        <span>{folder.name}</span>
                        <small>{folder.children.length}</small>
                        <button
                          className="icon organizer-actions"
                          aria-label={`Actions for ${folder.name}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            actions(folder, anchorAt(e.currentTarget));
                          }}
                        >
                          <Ellipsis size={14} />
                        </button>
                      </summary>
                      <ul>
                        {folder.children
                          .filter(
                            (n) =>
                              !query ||
                              vault.name
                                .toLowerCase()
                                .includes(query.toLowerCase()) ||
                              folder.name
                                .toLowerCase()
                                .includes(query.toLowerCase()) ||
                              matches(n),
                          )
                          .map((note) => (
                            <li
                              key={note.path}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                actions(note, {
                                  ...anchorAt(e.currentTarget),
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }}
                              draggable={!busy}
                              onDragStart={(e) => {
                                e.dataTransfer.setData("notus-note", "1");
                                e.dataTransfer.setData(
                                  "text/notus-kind",
                                  "note",
                                );
                                e.dataTransfer.setData(
                                  "text/notus-path",
                                  note.path,
                                );
                                e.dataTransfer.effectAllowed = "move";
                              }}
                            >
                              <button
                                className="organizer-note"
                                title={note.path}
                                disabled={busy}
                                onClick={() => void run(() => open(note.path))}
                              >
                                {stem(note.name)}
                              </button>
                            </li>
                          ))}
                      </ul>
                    </details>
                  ))}
                {!vault.children.length && (
                  <p className="folder-empty">No folders yet</p>
                )}
              </details>
            ))}
            {!entries.filter(matches).length && (
              <p className="muted">No matching vaults.</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
