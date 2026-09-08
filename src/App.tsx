import { useEffect, useLayoutEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FolderOpen,
  Import,
  Moon,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  X,
  Check,
  Save,
  FolderPlus,
  FilePlus2,
  Settings,
  EyeOff,
} from "lucide-react";
import { SidebarTree, InlineName } from "./SidebarTree";
import { anchorAt, type Anchor, type InlineEdit } from "./sidebarTypes";
import { AnchoredPanel } from "./AnchoredPanel";
import { TitleBar, type NoteTab } from "./TitleBar";
import {
  api,
  flatten,
  parentOf,
  stem,
  type Entry,
  type Snapshot,
  type Document,
} from "./notus";
import { splitFrontmatter } from "./core/markdown";
import logo from "../icon.svg";

const extensions = [
  markdown(),
  EditorView.lineWrapping,
  EditorView.contentAttributes.of({ "aria-label": "Note editor" }),
];
type DialogState = { kind: "delete"; entry: Entry };
type ActionMenu = { entry: Entry; anchor: Anchor; settings?: boolean };
const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string) => localStorage.setItem(key, value),
  remove: (key: string) => localStorage.removeItem(key),
};
function Icon({
  label,
  children,
  onClick,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="icon"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef(document.activeElement as HTMLElement);
  useLayoutEffect(() => {
    const el = ref.current!;
    const previous = trigger.current;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <Icon label="Close dialog" onClick={onClose}>
          <X size={18} />
        </Icon>
      </header>
      {children}
    </dialog>
  );
}
export default function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ root: "", entries: [] });
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [doc, setDoc] = useState<Document | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState("Saved");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    storage.get("notus-theme") === "dark" ? "dark" : "light",
  );
  const [sidebar, setSidebar] = useState(
    () => storage.get("notus-sidebar") !== "closed",
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [actions, setActions] = useState<ActionMenu | null>(null);
  const [inline, setInline] = useState<InlineEdit | null>(null);
  const [hiddenVaults, setHiddenVaults] = useState<string[]>([]);
  const [hiddenPanel, setHiddenPanel] = useState<Anchor | null>(null);
  const [tabs, setTabs] = useState<NoteTab[]>([{ id: 1, path: null }]);
  const [activeTab, setActiveTab] = useState(1);
  const tabSequence = useRef(1);
  const activeTabRef = useRef(1);
  const inlineTrigger = useRef<HTMLElement | null>(null);
  const inlineBusy = useRef(false);
  const [name, setName] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [working, setWorking] = useState(false);
  const current = useRef<{ doc: Document | null; draft: string; root: string }>(
    { doc: null, draft: "", root: "" },
  );
  const pending = useRef<Promise<boolean> | null>(null);
  const navigating = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const visibleEntries = snapshot.entries.filter(
    (e) => !hiddenVaults.includes(e.path),
  );
  const files = flatten(visibleEntries);
  const selectedEntry = files.find((e) => e.path === selected);
  const folder =
    selectedEntry?.kind === "note"
      ? parentOf(selectedEntry.path)
      : (selectedEntry?.path ?? "");
  const canCreateNote = !!folder;
  const draftKey = (path: string) =>
    `notus-draft:${current.current.root}:${path}`;
  const loadDocument = (next: Document) => {
    let text = next.content;
    let base = next;
    let conflicted = false;
    const saved = storage.get(draftKey(next.path));
    if (saved !== null) {
      try {
        const recovery = JSON.parse(saved) as {
          content: string;
          revision: string;
        };
        if (
          typeof recovery.content === "string" &&
          typeof recovery.revision === "string"
        ) {
          text = recovery.content;
          if (text !== next.content) {
            setNotice("Recovered your unsaved draft.");
            conflicted = recovery.revision !== next.revision;
            base = { ...next, revision: recovery.revision };
          } else storage.remove(draftKey(next.path));
        }
      } catch {
        setError("Could not read the saved draft recovery record.");
      }
    }
    current.current.doc = base;
    current.current.draft = text;
    setDoc(base);
    setTabs((previous) =>
      previous.map((tab) =>
        tab.id === activeTabRef.current ? { ...tab, path: next.path } : tab,
      ),
    );
    setDraft(text);
    setStatus(
      conflicted
        ? "Conflict"
        : text === next.content
          ? "Saved"
          : "Unsaved draft",
    );
    if (conflicted)
      setError(
        "CONFLICT: Your recovered draft and the file on disk both changed. Save a recovery copy to keep both.",
      );
    storage.set(`notus-last:${current.current.root}`, next.path);
  };
  const refresh = async () => {
    const next = await api.snapshot();
    setSnapshot(next);
    return next;
  };
  const save = async (): Promise<boolean> => {
    if (pending.current) {
      if (!(await pending.current)) return false;
      return save();
    }
    const state = current.current;
    if (!state.doc || state.doc.content === state.draft) return true;
    const original = state.doc,
      text = state.draft;
    setStatus("Saving…");
    const task = (async () => {
      try {
        const next = await api.write(original.path, text, original.revision);
        if (current.current.doc?.path === original.path) {
          current.current.doc = next;
          setDoc(next);
          if (current.current.draft === text) {
            storage.remove(draftKey(next.path));
            setStatus("Saved");
          } else setStatus("Unsaved draft");
        }
        return true;
      } catch (e) {
        setError(String(e));
        setStatus(String(e).includes("CONFLICT") ? "Conflict" : "Save failed");
        return false;
      }
    })();
    pending.current = task;
    const result = await task;
    pending.current = null;
    if (result && current.current.doc?.content !== current.current.draft)
      return save();
    return result;
  };
  const run = (task: () => Promise<void>) => {
    void task().catch((e) => setError(String(e)));
  };
  const openNote = async (path: string) => {
    if (navigating.current) return;
    navigating.current = true;
    try {
      if (!(await save())) return;
      const next = await api.read(path);
      const existing = tabs.find((tab) => tab.path === path);
      if (existing) {
        activeTabRef.current = existing.id;
        setActiveTab(existing.id);
      }
      setError("");
      loadDocument(next);
      setSelected(path);
    } finally {
      navigating.current = false;
    }
  };
  const edit = (text: string) => {
    if (!current.current.doc) return;
    try {
      storage.set(
        draftKey(current.current.doc.path),
        JSON.stringify({
          content: text,
          revision: current.current.doc.revision,
        }),
      );
    } catch {
      setError(
        "Draft recovery storage is full. Keep this note open until it has saved.",
      );
    }
    current.current.draft = text;
    setDraft(text);
    setStatus(text === current.current.doc.content ? "Saved" : "Unsaved draft");
  };
  const live = useRef({ save, refresh, loadDocument });
  live.current = { save, refresh, loadDocument };
  useEffect(() => {
    let cancelled = false;
    void api
      .snapshot()
      .then(async (next) => {
        if (cancelled) return;
        current.current.root = next.root;
        setSnapshot(next);
        let hidden: string[] = [];
        try {
          const saved = JSON.parse(
            storage.get(`notus-hidden:${next.root}`) ?? "[]",
          );
          if (Array.isArray(saved))
            hidden = saved.filter(
              (value): value is string => typeof value === "string",
            );
        } catch {
          /* Ignore malformed UI preferences. */
        }
        setHiddenVaults(hidden);
        const last = storage.get(`notus-last:${next.root}`);
        const found = flatten(
          next.entries.filter((e) => !hidden.includes(e.path)),
        ).find((e) => e.path === last && e.kind === "note");
        if (found) {
          const note = await api.read(found.path);
          if (!cancelled) {
            live.current.loadDocument(note);
            setSelected(note.path);
          }
        } else
          setSelected(
            next.entries.find((e) => !hidden.includes(e.path))?.path ?? "",
          );
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    storage.set("notus-theme", theme);
    void getCurrentWindow()
      .setTheme(theme)
      .catch(() => {});
  }, [theme]);
  useEffect(() => {
    storage.set("notus-sidebar", sidebar ? "open" : "closed");
  }, [sidebar]);
  useEffect(() => {
    if (
      !doc ||
      draft === doc.content ||
      status === "Conflict" ||
      status === "Save failed"
    )
      return;
    const timer = setTimeout(() => {
      void live.current.save();
    }, 550);
    return () => clearTimeout(timer);
  }, [draft, doc, status]);
  useEffect(() => {
    let polling = false;
    const timer = setInterval(() => {
      if (
        polling ||
        navigating.current ||
        pending.current ||
        !current.current.root
      )
        return;
      polling = true;
      void (async () => {
        await live.current.refresh();
        const before = current.current;
        const note = before.doc;
        if (note && before.draft === note.content) {
          const next = await api.read(note.path);
          if (
            current.current.doc === note &&
            current.current.draft === note.content &&
            next.revision !== note.revision
          )
            live.current.loadDocument(next);
        }
      })()
        .catch((e) => setError(String(e)))
        .finally(() => {
          polling = false;
        });
    }, 3000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        if (await live.current.save()) await getCurrentWindow().destroy();
      })
      .then((fn) => {
        if (disposed) fn();
        else unlisten = fn;
      });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(timer);
  }, [notice]);
  const showCreate = (kind: Entry["kind"], parent = folder) => {
    inlineTrigger.current =
      actions?.anchor.trigger ?? (document.activeElement as HTMLElement);
    setActions(null);
    setHiddenPanel(null);
    setSidebar(true);
    setQuery("");
    setName("");
    setDialogError("");
    const target = kind === "vault" ? "" : parent;
    setInline({ kind: "create", entryKind: kind, parent: target });
    setCollapsed(
      (previous) =>
        new Set(
          [...previous].filter(
            (path) => target !== path && !target.startsWith(path + "/"),
          ),
        ),
    );
  };
  const cancelInline = () => {
    if (inlineBusy.current) return;
    setInline(null);
    setDialogError("");
    requestAnimationFrame(() => inlineTrigger.current?.focus());
  };
  const resetDocument = () => {
    current.current.doc = null;
    current.current.draft = "";
    setDoc(null);
    setDraft("");
    setError("");
    setStatus("Saved");
  };
  const selectTab = async (id: number) => {
    if (navigating.current) return;
    navigating.current = true;
    try {
      if (!(await save())) return;
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      const next = tab.path ? await api.read(tab.path) : null;
      activeTabRef.current = id;
      setActiveTab(id);
      if (next) {
        setError("");
        loadDocument(next);
        setSelected(next.path);
      } else {
        resetDocument();
        storage.remove(`notus-last:${current.current.root}`);
      }
    } finally {
      navigating.current = false;
    }
  };
  const newTab = async () => {
    if (navigating.current) return;
    navigating.current = true;
    try {
      if (!(await save())) return;
      const id = ++tabSequence.current;
      setTabs((previous) => [...previous, { id, path: null }]);
      activeTabRef.current = id;
      setActiveTab(id);
      resetDocument();
      storage.remove(`notus-last:${current.current.root}`);
    } finally {
      navigating.current = false;
    }
  };
  const closeTab = async (id: number) => {
    if (id === activeTabRef.current) {
      if (tabs.length === 1) {
        if (!(await save())) return;
        resetDocument();
        setTabs([{ id, path: null }]);
        storage.remove(`notus-last:${current.current.root}`);
        return;
      }
      const index = tabs.findIndex((t) => t.id === id);
      await selectTab(tabs[index === 0 ? 1 : index - 1].id);
      if (activeTabRef.current === id) return;
    }
    setTabs((previous) => previous.filter((tab) => tab.id !== id));
  };
  useEffect(() => {
    const context = (event: MouseEvent) => {
      if (
        !(event.target as HTMLElement).closest(
          "input, textarea, [contenteditable=true], .reading",
        )
      )
        event.preventDefault();
    };
    document.addEventListener("contextmenu", context);
    return () => document.removeEventListener("contextmenu", context);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (inline || dialog || actions || hiddenPanel) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        run(async () => {
          await save();
        });
      }
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        if (canCreateNote) showCreate("note");
        else setNotice("Select a vault or folder to create a note.");
      }
      if (e.key.toLowerCase() === "b") {
        e.preventDefault();
        setSidebar((v) => !v);
      }
      if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setSidebar(true);
        setTimeout(() => searchRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  const afterRelocate = async (old: string, next: string) => {
    setTabs((previous) =>
      previous.map((tab) =>
        tab.path && (tab.path === old || tab.path.startsWith(old + "/"))
          ? { ...tab, path: next + tab.path.slice(old.length) }
          : tab,
      ),
    );
    const path = current.current.doc?.path;
    if (path && (path === old || path.startsWith(old + "/"))) {
      storage.remove(draftKey(path));
      loadDocument(await api.read(next + path.slice(old.length)));
    }
    setSelected(next);
    setCollapsed(new Set());
    await refresh();
  };
  const move = async (source: string, parent: string) => {
    if (!(await save())) return;
    const next = await api.relocate(source, parent, source.split("/").at(-1)!);
    await afterRelocate(source, next);
    setNotice("Moved successfully.");
  };
  const commitInline = async () => {
    if (!inline || inlineBusy.current) return;
    inlineBusy.current = true;
    setWorking(true);
    setDialogError("");
    try {
      if (!(await save())) {
        setDialogError("Save or recover the current draft first.");
        return;
      }
      if (inline.kind === "create") {
        const path = await api.create(
          inline.parent,
          inline.entryKind,
          name.trim(),
        );
        await refresh();
        setSelected(path);
        if (inline.entryKind === "note") {
          loadDocument(await api.read(path));
          setMode("edit");
        }
      } else {
        const next = await api.relocate(
          inline.entry.path,
          parentOf(inline.entry.path),
          name.trim(),
        );
        await afterRelocate(inline.entry.path, next);
      }
      setInline(null);
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(".tree-row.selected .tree-select")
          ?.focus(),
      );
    } catch (e) {
      setDialogError(String(e));
    } finally {
      inlineBusy.current = false;
      setWorking(false);
    }
  };
  const forgetPaths = (entry: Entry) => {
    const belongs = (path: string) =>
      path === entry.path || path.startsWith(entry.path + "/");
    setTabs((previous) =>
      previous.map((tab) =>
        tab.path && belongs(tab.path) ? { ...tab, path: null } : tab,
      ),
    );
    const path = current.current.doc?.path;
    if (path && belongs(path)) {
      storage.remove(draftKey(path));
      resetDocument();
      storage.remove(`notus-last:${current.current.root}`);
    }
    setSelected(parentOf(entry.path));
  };
  const commitDialog = async () => {
    if (!dialog || working) return;
    setWorking(true);
    setDialogError("");
    try {
      if (!(await save())) {
        setDialogError("Save or recover the current draft first.");
        return;
      }
      await api.remove(dialog.entry.path);
      forgetPaths(dialog.entry);
      await refresh();
      setNotice("Moved to the Recycle Bin.");
      setDialog(null);
    } catch (e) {
      setDialogError(String(e));
    } finally {
      setWorking(false);
    }
  };
  const renameEntry = (entry: Entry) => {
    inlineTrigger.current =
      actions?.anchor.trigger ?? (document.activeElement as HTMLElement);
    setActions(null);
    setSidebar(true);
    setQuery("");
    setSelected(entry.path);
    setCollapsed(
      (previous) =>
        new Set(
          [...previous].filter((path) => !entry.path.startsWith(path + "/")),
        ),
    );
    setName(entry.kind === "note" ? stem(entry.name) : entry.name);
    setDialogError("");
    setInline({ kind: "rename", entry });
  };
  const deleteEntry = (entry: Entry) => {
    setActions(null);
    setDialogError("");
    setDialog({ kind: "delete", entry });
  };
  const updateHidden = (hidden: string[]) => {
    storage.set(`notus-hidden:${current.current.root}`, JSON.stringify(hidden));
    setHiddenVaults(hidden);
  };
  const hideVault = async (entry: Entry) => {
    if (!(await save())) return;
    updateHidden([...hiddenVaults, entry.path]);
    forgetPaths(entry);
    setActions(null);
    setNotice(
      "Vault removed from sidebar. Files are unchanged; restore it from Hidden vaults.",
    );
  };
  const changeRoot = async () => {
    if (!(await save())) return;
    if (!(await api.chooseRoot())) return;
    current.current.doc = null;
    current.current.draft = "";
    setDoc(null);
    setDraft("");
    const next = await refresh();
    current.current.root = next.root;
    let hidden: string[] = [];
    try {
      const saved = JSON.parse(
        storage.get(`notus-hidden:${next.root}`) ?? "[]",
      );
      if (Array.isArray(saved))
        hidden = saved.filter(
          (value): value is string => typeof value === "string",
        );
    } catch {
      /* Ignore malformed UI preferences. */
    }
    setHiddenVaults(hidden);
    setTabs([{ id: activeTabRef.current, path: null }]);
    setInline(null);
    setActions(null);
    setHiddenPanel(null);
    setSelected(next.entries.find((e) => !hidden.includes(e.path))?.path ?? "");
    setCollapsed(new Set());
  };
  const recoverCopy = async () => {
    const state = current.current;
    if (!state.doc) return;
    const old = state.doc.path;
    const path = await api.create(
      parentOf(old),
      "note",
      `${stem(old)} recovered ${Date.now()}`,
    );
    const blank = await api.read(path);
    const next = await api.write(path, state.draft, blank.revision);
    storage.remove(draftKey(old));
    loadDocument(next);
    setSelected(path);
    setError("");
    await refresh();
  };
  const inlineEditor = (
    <InlineName
      value={name}
      error={dialogError}
      working={working}
      onChange={setName}
      onConfirm={() => void commitInline()}
      onCancel={cancelInline}
    />
  );
  const showActions = (entry: Entry, anchor: Anchor) => {
    if (inlineBusy.current) return;
    setInline(null);
    setHiddenPanel(null);
    setActions({ entry, anchor });
  };

  return (
    <div className={`shell ${sidebar ? "" : "collapsed"}`}>
      <a className="skip-link" href="#editor-workspace">
        Skip to workspace
      </a>
      <TitleBar
        sidebar={sidebar}
        toggleSidebar={() => {
          setSidebar((v) => !v);
          setActions(null);
          setHiddenPanel(null);
          if (!inlineBusy.current) setInline(null);
        }}
        search={() => {
          setSidebar(true);
          setTimeout(() => searchRef.current?.focus(), 0);
        }}
        tabs={tabs}
        active={activeTab}
        selectTab={(id) => run(() => selectTab(id))}
        closeTab={(id) => run(() => closeTab(id))}
        newTab={() => run(newTab)}
        status={doc ? status : ""}
        onError={setError}
      />
      {sidebar && (
        <aside className="sidebar">
          <label className="search-box">
            <Search size={16} />
            <input
              ref={searchRef}
              aria-label="Find a note or folder"
              placeholder="Find a note or folder…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>Ctrl P</kbd>
          </label>
          <div className="vault-heading">
            <span>VAULTS</span>
            <Icon label="Create vault" onClick={() => showCreate("vault")}>
              <Plus size={18} />
            </Icon>
          </div>
          <nav className="file-tree" aria-label="Vaults and notes">
            <SidebarTree
              entries={visibleEntries}
              selected={selected}
              collapsed={collapsed}
              query={query}
              onToggle={(path) =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(path)) next.delete(path);
                  else next.add(path);
                  return next;
                })
              }
              onSelect={(entry) => {
                if (entry.kind === "note") run(() => openNote(entry.path));
                else setSelected(entry.path);
              }}
              onMove={(source, parent) => run(() => move(source, parent))}
              onActions={showActions}
              inline={inline}
              editor={inlineEditor}
            />
            {!visibleEntries.length && !loading && !inline && (
              <div className="sidebar-empty">
                <p>No vaults yet.</p>
                <button onClick={() => showCreate("vault")}>
                  <Plus size={15} />
                  Create your first vault
                </button>
              </div>
            )}
            {query &&
              !files.some((e) =>
                e.name.toLowerCase().includes(query.toLowerCase()),
              ) && <p className="muted tree-empty">No matches.</p>}
          </nav>
          <footer className="sidebar-footer">
            {hiddenVaults.length > 0 && (
              <button
                className="hidden-vaults-button"
                onClick={(event) => {
                  setActions(null);
                  setHiddenPanel(anchorAt(event.currentTarget));
                }}
              >
                <EyeOff size={15} />
                Hidden vaults ({hiddenVaults.length})
              </button>
            )}
            <button
              className="workspace-location"
              title={snapshot.root || "Workspace folder"}
              onClick={() => run(changeRoot)}
            >
              <FolderOpen size={16} />
              <span>
                Workspace<small>{snapshot.root || "Loading…"}</small>
              </span>
            </button>
            <div>
              <span className="footer-brand">
                <img src={logo} alt="" />
                Notus
              </span>
              <Icon
                label="Import existing vault"
                onClick={() =>
                  run(async () => {
                    if (!(await save())) return;
                    const path = await api.importVault();
                    if (path) {
                      await refresh();
                      setSelected(path);
                      setNotice(
                        "Vault copied into Notus. Original files are unchanged.",
                      );
                    }
                  })
                }
              >
                <Import size={17} />
              </Icon>
              <Icon
                label={
                  theme === "light"
                    ? "Switch to dark theme"
                    : "Switch to light theme"
                }
                onClick={() =>
                  setTheme((t) => (t === "light" ? "dark" : "light"))
                }
              >
                {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              </Icon>
            </div>
          </footer>
        </aside>
      )}
      <section className="workspace">
        {error && (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            {doc && (
              <button onClick={() => run(recoverCopy)}>
                Save recovery copy
              </button>
            )}
            <Icon label="Dismiss error" onClick={() => setError("")}>
              <X size={15} />
            </Icon>
          </div>
        )}
        <main id="editor-workspace" tabIndex={-1}>
          {loading ? (
            <div className="empty-note">
              <p>Opening your workspace…</p>
            </div>
          ) : doc ? (
            <section className="note-view">
              <header className="note-heading">
                <div>
                  <p className="eyebrow">
                    {parentOf(doc.path).replaceAll("/", " / ")}
                  </p>
                  <h1>{stem(doc.path)}</h1>
                </div>
                <div className="note-actions">
                  <div className="segmented" aria-label="Editor mode">
                    <button
                      aria-pressed={mode === "edit"}
                      className={mode === "edit" ? "active" : ""}
                      onClick={() => setMode("edit")}
                    >
                      Write
                    </button>
                    <button
                      aria-pressed={mode === "read"}
                      className={mode === "read" ? "active" : ""}
                      onClick={() => setMode("read")}
                    >
                      Read
                    </button>
                  </div>
                  <Icon
                    label="Save note (Ctrl+S)"
                    onClick={() =>
                      run(async () => {
                        await save();
                      })
                    }
                  >
                    <Save size={17} />
                  </Icon>
                </div>
              </header>
              <div className="document-scroll">
                {mode === "edit" ? (
                  <CodeMirror
                    className="editor"
                    value={draft}
                    theme={theme}
                    extensions={extensions}
                    onChange={edit}
                    basicSetup={{
                      lineNumbers: false,
                      foldGutter: false,
                      highlightActiveLine: false,
                      highlightActiveLineGutter: false,
                    }}
                  />
                ) : (
                  <article className="reading">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {splitFrontmatter(draft).body}
                    </ReactMarkdown>
                  </article>
                )}
              </div>
              <footer className="note-footer">
                <span>
                  {draft.trim() ? draft.trim().split(/\s+/).length : 0} words
                </span>
                <span>Markdown · UTF-8</span>
              </footer>
            </section>
          ) : (
            <section className="empty-note">
              <img src={logo} alt="" />
              <h1>{selectedEntry ? selectedEntry.name : "Your workspace"}</h1>
              <p>
                {!visibleEntries.length
                  ? "Create a vault using + in the sidebar."
                  : "Open a note from the sidebar. Right-click a vault or folder to create something inside it."}
              </p>
            </section>
          )}
        </main>
      </section>
      {actions && (
        <AnchoredPanel
          key={actions.settings ? "settings" : "menu"}
          anchor={actions.anchor}
          label={
            actions.settings
              ? "Vault settings"
              : `Actions for ${actions.entry.name}`
          }
          menu={!actions.settings}
          onClose={() => setActions(null)}
        >
          {actions.settings ? (
            <>
              <header>
                <h2>Vault settings</h2>
                <Icon
                  label="Close vault settings"
                  onClick={() => setActions(null)}
                >
                  <X size={16} />
                </Icon>
              </header>
              <p className="vault-name">{actions.entry.name}</p>
              <button onClick={() => renameEntry(actions.entry)}>
                <Pencil size={15} />
                Rename vault
              </button>
              <p className="vault-location">
                {snapshot.root}
                {"\\"}
                {actions.entry.path}
              </p>
              <button onClick={() => run(() => api.reveal(actions.entry.path))}>
                <FolderOpen size={15} />
                Reveal in File Explorer
              </button>
              <hr />
              <button onClick={() => run(() => hideVault(actions.entry))}>
                <EyeOff size={15} />
                Remove from sidebar
              </button>
              <p className="dialog-hint">
                Keeps all files on disk. Restore from Hidden vaults.
              </p>
              <hr />
              <button
                className="danger"
                onClick={() => deleteEntry(actions.entry)}
              >
                <Trash2 size={15} />
                Delete vault…
              </button>
            </>
          ) : (
            <>
              {actions.entry.kind !== "note" && (
                <>
                  {actions.entry.kind === "vault" && (
                    <button
                      role="menuitem"
                      onClick={() => showCreate("folder", actions.entry.path)}
                    >
                      <FolderPlus size={15} />
                      New folder
                    </button>
                  )}
                  <button
                    role="menuitem"
                    onClick={() => showCreate("note", actions.entry.path)}
                  >
                    <FilePlus2 size={15} />
                    New note
                  </button>
                  {actions.entry.kind === "folder" && (
                    <button
                      role="menuitem"
                      onClick={() => showCreate("folder", actions.entry.path)}
                    >
                      <FolderPlus size={15} />
                      New subfolder
                    </button>
                  )}
                </>
              )}
              {actions.entry.kind === "vault" ? (
                <button
                  role="menuitem"
                  onClick={() => setActions({ ...actions, settings: true })}
                >
                  <Settings size={15} />
                  Vault settings
                </button>
              ) : (
                <>
                  <button
                    role="menuitem"
                    onClick={() => renameEntry(actions.entry)}
                  >
                    <Pencil size={15} />
                    Rename
                  </button>
                  <button
                    role="menuitem"
                    className="danger"
                    onClick={() => deleteEntry(actions.entry)}
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </>
              )}
            </>
          )}
        </AnchoredPanel>
      )}
      {hiddenPanel && (
        <AnchoredPanel
          anchor={hiddenPanel}
          label="Hidden vaults"
          onClose={() => setHiddenPanel(null)}
        >
          <header>
            <h2>Hidden vaults</h2>
            <Icon
              label="Close hidden vaults"
              onClick={() => setHiddenPanel(null)}
            >
              <X size={16} />
            </Icon>
          </header>
          <p className="dialog-hint">Files have not been moved or deleted.</p>
          {hiddenVaults.map((path) => (
            <button
              key={path}
              onClick={() => {
                updateHidden(hiddenVaults.filter((p) => p !== path));
                setHiddenPanel(null);
              }}
            >
              Restore {path}
            </button>
          ))}
        </AnchoredPanel>
      )}
      {dialog && (
        <Modal
          title="Move to Recycle Bin?"
          onClose={() => {
            if (!working) setDialog(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void commitDialog();
            }}
          >
            <p className="delete-description">
              “{dialog.entry.name}”
              {dialog.entry.kind !== "note" ? " and everything inside it" : ""}{" "}
              will go to the Windows Recycle Bin.
            </p>
            {dialogError && (
              <p className="dialog-error" role="alert">
                {dialogError}
              </p>
            )}
            <footer className="dialog-footer">
              <button
                type="button"
                onClick={() => setDialog(null)}
                disabled={working}
              >
                Cancel
              </button>
              <button
                className="primary danger-button"
                type="submit"
                disabled={working}
              >
                {working ? "Working…" : "Move to Recycle Bin"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
    </div>
  );
}
