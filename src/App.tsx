import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import cytoscape from "cytoscape";
import {
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  File,
  FilePlus2,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  Globe2,
  Grid2X2,
  HardDrive,
  History,
  LayoutList,
  Link2,
  LoaderCircle,
  Network,
  PanelRight,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  WandSparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import type {
  AIProvider,
  FileEntry,
  NoteDocument,
  Vault,
  VaultIndex,
} from "./types";
import { splitFrontmatter, updateFrontmatter } from "./core/markdown";

type View =
  | "files"
  | "search"
  | "graph"
  | "backlinks"
  | "ai"
  | "models"
  | "settings"
  | "vaults";
type Tab = { path: string; pinned?: boolean };
const defaultProviders: AIProvider[] = [
  {
    id: "local-openai",
    name: "Local runtime",
    kind: "local",
    baseUrl: "http://127.0.0.1:1234/v1",
    model: "local-model",
    configured: true,
  },
  {
    id: "online-openai",
    name: "OpenAI-compatible",
    kind: "online",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    configured: false,
  },
];
const actions = [
  "Correct writing",
  "Improve clarity",
  "Shorten",
  "Expand",
  "Translate",
  "Summarize",
  "Create outline",
  "Extract tasks",
  "Suggest tags",
  "Suggest properties",
  "Suggest wiki links",
  "Find related notes",
];

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="2.3"
        d="M7 8.5 16 3l9 5.5v15L16 29l-9-5.5zM7 8.5l9 5.2 9-5.2M16 13.7V29M7 23.5l9-5 9 5"
      />
      <circle cx="16" cy="13.7" r="2.4" fill="currentColor" />
    </svg>
  );
}
function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function ActivityRail({
  view,
  setView,
  openVaults,
}: {
  view: View;
  setView: (v: View) => void;
  openVaults: () => void;
}) {
  const items: [View, string, React.ReactNode][] = [
    ["files", "Files", <Files />],
    ["search", "Search", <Search />],
    ["graph", "Graph", <Network />],
    ["backlinks", "Backlinks", <Link2 />],
    ["ai", "AI assistant", <Bot />],
    ["models", "Model library", <BrainCircuit />],
  ];
  return (
    <nav className="activity-rail" aria-label="Workspace views">
      <div className="brand-mark" title="Lattice Notes">
        <Logo />
      </div>
      {items.map(([id, label, icon]) => (
        <IconButton
          key={id}
          label={label}
          active={view === id}
          onClick={() => setView(id)}
        >
          {icon}
        </IconButton>
      ))}
      <div className="rail-spacer" />
      <IconButton
        label="Vault Manager"
        active={view === "vaults"}
        onClick={openVaults}
      >
        <HardDrive />
      </IconButton>
      <IconButton
        label="Settings"
        active={view === "settings"}
        onClick={() => setView("settings")}
      >
        <Settings />
      </IconButton>
    </nav>
  );
}

function VaultManager({
  vaults,
  onOpen,
  onAdd,
  onRemove,
  onUpdate,
}: {
  vaults: Vault[];
  onOpen: (v: Vault) => void;
  onAdd: (m: "create" | "open", s?: boolean) => void;
  onRemove: (v: Vault) => void;
  onUpdate: (v: Vault) => void;
}) {
  const [query, setQuery] = useState("");
  const [grid, setGrid] = useState(false);
  const [starter, setStarter] = useState(true);
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const shown = [...vaults]
    .filter((v) =>
      (v.name + " " + v.path).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      a.pinned === b.pinned
        ? sort === "name"
          ? a.name.localeCompare(b.name)
          : b.lastOpened - a.lastOpened
        : Number(b.pinned) - Number(a.pinned),
    );
  return (
    <main className="vault-manager" id="main-content">
      <header className="vault-hero">
        <div>
          <div className="eyebrow">
            <Logo size={20} /> LATTICE NOTES
          </div>
          <h1>Your knowledge, grounded locally.</h1>
          <p>
            Open any folder of Markdown files. Nothing is moved, converted, or
            uploaded.
          </p>
        </div>
        <div className="vault-actions">
          <button className="primary" onClick={() => onAdd("create", starter)}>
            <Plus /> Create vault
          </button>
          <button onClick={() => onAdd("open")}>
            <FolderOpen /> Open folder
          </button>
          <label className="check-row">
            <input
              type="checkbox"
              checked={starter}
              onChange={(e) => setStarter(e.target.checked)}
            />{" "}
            Include starter structure
          </label>
        </div>
      </header>
      <section className="vault-library" aria-labelledby="vault-heading">
        <div className="section-heading">
          <div>
            <h2 id="vault-heading">Vault library</h2>
            <span>
              {vaults.length} registered{" "}
              {vaults.length === 1 ? "vault" : "vaults"}
            </span>
          </div>
          <div className="toolbar">
            <label className="searchbox">
              <Search />
              <span className="sr-only">Search vaults</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search names or paths…"
              />
            </label>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as any)}
              aria-label="Sort vaults"
            >
              <option value="recent">Recent activity</option>
              <option value="name">Name</option>
            </select>
            <div className="segmented">
              <IconButton
                label="List view"
                active={!grid}
                onClick={() => setGrid(false)}
              >
                <LayoutList />
              </IconButton>
              <IconButton
                label="Grid view"
                active={grid}
                onClick={() => setGrid(true)}
              >
                <Grid2X2 />
              </IconButton>
            </div>
          </div>
        </div>
        {shown.length ? (
          <div className={grid ? "vault-grid" : "vault-list"}>
            {shown.map((v) => (
              <article
                className={`vault-card ${!v.available ? "unavailable" : ""}`}
                key={v.id}
                onDoubleClick={() => v.available && onOpen(v)}
              >
                <div className="vault-symbol">
                  <Logo />
                </div>
                <div className="vault-info">
                  <h3>{v.name}</h3>
                  <p title={v.path}>{v.path}</p>
                  <div className="meta">
                    <span className={v.available ? "available" : "offline"}>
                      {v.available ? (
                        <>
                          <Wifi /> Available
                        </>
                      ) : (
                        <>
                          <WifiOff /> Disconnected
                        </>
                      )}
                    </span>
                    <span>
                      <Clock3 />{" "}
                      {v.lastOpened
                        ? new Date(v.lastOpened).toLocaleDateString()
                        : "Never opened"}
                    </span>
                  </div>
                </div>
                <div className="card-actions">
                  <IconButton
                    label={v.pinned ? "Unpin vault" : "Pin vault"}
                    onClick={() => onUpdate({ ...v, pinned: !v.pinned })}
                  >
                    {v.pinned ? <PinOff /> : <Pin />}
                  </IconButton>
                  <IconButton
                    label="Reveal in File Explorer"
                    onClick={() => window.lattice.reveal(v.path)}
                    disabled={!v.available}
                  >
                    <FolderOpen />
                  </IconButton>
                  <IconButton
                    label="Remove from Lattice Notes (files stay on disk)"
                    onClick={() => onRemove(v)}
                  >
                    <X />
                  </IconButton>
                  <button
                    className="open-button"
                    onClick={() => onOpen(v)}
                    disabled={!v.available}
                  >
                    {v.available ? "Open" : "Locate / retry"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">
              <HardDrive />
            </div>
            <h3>
              {vaults.length ? "No matching vaults" : "Bring your notes home"}
            </h3>
            <p>
              {vaults.length
                ? "Try another name or path."
                : "Create a new Markdown workspace or register a folder you already use."}
            </p>
            {!vaults.length && (
              <button className="primary" onClick={() => onAdd("open")}>
                <FolderOpen /> Open existing folder
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

function TreeNode({
  entry,
  selected,
  onOpen,
  onSelect,
  depth = 0,
}: {
  entry: FileEntry;
  selected?: string;
  onOpen: (p: string) => void;
  onSelect: (e: FileEntry) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(true);
  const folder = entry.kind === "folder";
  return (
    <div role="treeitem" aria-expanded={folder ? expanded : undefined}>
      <button
        className={`tree-row ${selected === entry.relativePath ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => {
          onSelect(entry);
          if (folder) setExpanded(!expanded);
          else onOpen(entry.relativePath);
        }}
        onDoubleClick={() => {
          if (folder) setExpanded(!expanded);
        }}
      >
        {folder ? expanded ? <ChevronDown /> : <ChevronRight /> : <File />}
        <span>{entry.name.replace(/\.md$/i, "")}</span>
      </button>
      {folder && expanded && (
        <div role="group">
          {entry.children?.map((c) => (
            <TreeNode
              key={c.relativePath}
              entry={c}
              selected={selected}
              onOpen={onOpen}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
function Sidebar({
  vault,
  tree,
  selected,
  onSelect,
  onOpen,
  onCreate,
  onRename,
  onDuplicate,
  onDelete,
  onRefresh,
}: {
  vault: Vault;
  tree: FileEntry[];
  selected?: FileEntry;
  onSelect: (e: FileEntry) => void;
  onOpen: (p: string) => void;
  onCreate: (k: "file" | "folder") => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  return (
    <aside className="sidebar">
      <header>
        <div>
          <span className="sidebar-label">VAULT</span>
          <strong>{vault.name}</strong>
        </div>
        <IconButton label="Refresh files" onClick={onRefresh}>
          <RefreshCw />
        </IconButton>
      </header>
      <div className="file-toolbar">
        <IconButton label="New note" onClick={() => onCreate("file")}>
          <FilePlus2 />
        </IconButton>
        <IconButton label="New folder" onClick={() => onCreate("folder")}>
          <FolderPlus />
        </IconButton>
        <span className="toolbar-separator" />
        <IconButton
          label="Rename selected"
          disabled={!selected}
          onClick={onRename}
        >
          <WandSparkles />
        </IconButton>
        <IconButton
          label="Duplicate selected"
          disabled={!selected}
          onClick={onDuplicate}
        >
          <Copy />
        </IconButton>
        <IconButton
          label="Delete selected to Recycle Bin"
          disabled={!selected}
          onClick={onDelete}
        >
          <Trash2 />
        </IconButton>
      </div>
      <div className="tree" role="tree" aria-label="Vault files">
        {tree.length ? (
          tree.map((e) => (
            <TreeNode
              key={e.relativePath}
              entry={e}
              selected={selected?.relativePath}
              onOpen={onOpen}
              onSelect={onSelect}
            />
          ))
        ) : (
          <div className="sidebar-empty">
            <Folder />
            No Markdown files yet
          </div>
        )}
      </div>
      <footer>
        <HardDrive />
        <span title={vault.path}>{vault.path}</span>
      </footer>
    </aside>
  );
}

function Properties({
  content,
  onChange,
}: {
  content: string;
  onChange: (value: string) => void;
}) {
  const parsed = useMemo(() => splitFrontmatter(content), [content]);
  const entries = Object.entries(parsed.properties);
  const set = (key: string, value: unknown) =>
    onChange(
      updateFrontmatter(content, { ...parsed.properties, [key]: value }),
    );
  if (!parsed.valid)
    return (
      <div className="yaml-error" role="alert">
        <ShieldCheck /> Frontmatter could not be parsed. Its original text is
        preserved; edit it in Source mode.
      </div>
    );
  return (
    <details className="properties" open>
      <summary>
        <Tag /> Properties <span>{entries.length}</span>
      </summary>
      {entries.map(([key, value]) => (
        <label className="property" key={key}>
          <span>{key}</span>
          {typeof value === "boolean" ? (
            <input
              type="checkbox"
              checked={value}
              onChange={(e) => set(key, e.target.checked)}
            />
          ) : typeof value === "number" ? (
            <input
              type="number"
              value={value}
              onChange={(e) => set(key, Number(e.target.value))}
            />
          ) : Array.isArray(value) ? (
            <input
              value={value.join(", ")}
              onChange={(e) =>
                set(
                  key,
                  e.target.value
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                )
              }
            />
          ) : value instanceof Date ? (
            <input
              type="date"
              value={value.toISOString().slice(0, 10)}
              onChange={(e) => set(key, e.target.value)}
            />
          ) : (
            <input
              type={/^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? "date" : "text"}
              value={String(value ?? "")}
              onChange={(e) => set(key, e.target.value)}
            />
          )}
        </label>
      ))}
      <button
        className="text-button"
        onClick={() => {
          const key = prompt("Property name");
          if (key) set(key, "");
        }}
      >
        <Plus /> Add property
      </button>
    </details>
  );
}

function MarkdownView({
  doc,
  mode,
  onChange,
  vault,
}: {
  doc: NoteDocument;
  mode: "source" | "read";
  onChange: (v: string) => void;
  vault: Vault;
}) {
  const parsed = splitFrontmatter(doc.content);
  if (mode === "source")
    return (
      <CodeMirror
        className="editor"
        value={doc.content}
        height="100%"
        extensions={[markdown({ base: markdownLanguage })]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          foldGutter: true,
          autocompletion: true,
          bracketMatching: true,
        }}
      />
    );
  return (
    <article className="reading">
      <Properties content={doc.content} onChange={onChange} />
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(e) => {
                if (href && !/^https?:/i.test(href)) e.preventDefault();
              }}
            >
              {children}
            </a>
          ),
          img: ({ src, alt }) => {
            const source =
              src && !/^(https?:|data:)/i.test(src)
                ? `file://${vault.path.replace(/\\/g, "/")}/${src}`
                : src;
            return <img src={source} alt={alt || ""} />;
          },
          code: ({ children, className }) => (
            <code className={className}>{children}</code>
          ),
        }}
      >
        {parsed.body
          .replace(
            /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g,
            (_match, target, heading, alias) =>
              `[${alias || target}](${target}.md${heading ? `#${heading}` : ""})`,
          )
          .replace(/\[\]\(/g, "[")}
      </ReactMarkdown>
    </article>
  );
}

function SearchView({
  index,
  onOpen,
}: {
  index: VaultIndex | null;
  onOpen: (p: string) => void;
}) {
  const [q, setQ] = useState("");
  const results = useMemo(
    () =>
      !q
        ? []
        : (index?.notes || [])
            .map((n) => ({
              n,
              at: (
                n.title +
                " " +
                n.path +
                " " +
                n.content +
                " " +
                n.tags.join(" ")
              )
                .toLowerCase()
                .indexOf(q.toLowerCase()),
            }))
            .filter((x) => x.at >= 0),
    [q, index],
  );
  return (
    <section className="content-view">
      <div className="view-header">
        <div>
          <span className="eyebrow">FULL VAULT</span>
          <h2>Search</h2>
        </div>
      </div>
      <label className="hero-search">
        <Search />
        <span className="sr-only">Search notes</span>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search titles, paths, content, tags, and properties"
        />
        <kbd>Ctrl K</kbd>
      </label>
      {q && (
        <p className="result-count">
          {results.length} result{results.length === 1 ? "" : "s"}
        </p>
      )}
      <div className="results">
        {results.map(({ n }) => (
          <button
            className="result-card"
            onClick={() => onOpen(n.path)}
            key={n.path}
          >
            <File />
            <div>
              <strong>{n.title}</strong>
              <span>{n.path}</span>
              <p>{excerpt(n.content, q)}</p>
            </div>
          </button>
        ))}
        {q && !results.length && (
          <div className="empty-state compact">
            <Search />
            <h3>No notes found</h3>
            <p>Try a broader term or check another vault.</p>
          </div>
        )}
      </div>
    </section>
  );
}
function excerpt(text: string, q: string) {
  const clean = text.replace(/---[\s\S]*?---/, "").replace(/[#*_`>]/g, " ");
  const i = clean.toLowerCase().indexOf(q.toLowerCase());
  return clean
    .slice(Math.max(0, i - 60), i + 160)
    .replace(/\s+/g, " ")
    .trim();
}

function GraphView({
  index,
  onOpen,
  localPath,
}: {
  index: VaultIndex | null;
  onOpen: (p: string) => void;
  localPath?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [depth, setDepth] = useState(2);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!ref.current || !index) return;
    let notes = index.notes;
    if (localPath) {
      const seed = notes.find((n) => n.path === localPath);
      const targets = new Set([
        localPath,
        ...(seed?.links.map((l) => l.target) || []),
      ]);
      notes = notes.filter((n) => targets.has(n.path) || targets.has(n.title));
    }
    const id = new Map(notes.map((n) => [n.title.toLowerCase(), n.path]));
    const elements: any[] = [
      ...notes.map((n) => ({
        data: {
          id: n.path,
          label: n.title,
          type: n.links.length ? "linked" : "orphan",
        },
      })),
      ...notes.flatMap((n) =>
        n.links.map((l, i) => ({
          data: {
            id: `${n.path}-${i}`,
            source: n.path,
            target: id.get(l.target.toLowerCase()) || `?${l.target}`,
            unresolved: !id.has(l.target.toLowerCase()),
          },
        })),
      ),
      ...index.unresolved.map((u) => ({
        data: { id: `?${u}`, label: u, type: "unresolved" },
      })),
    ];
    const cy = cytoscape({
      container: ref.current,
      elements,
      minZoom: 0.2,
      maxZoom: 1.35,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "#35b7a5",
            label: "data(label)",
            color: "#b9c5c2",
            "font-size": 11,
            "min-zoomed-font-size": "8px",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            "text-valign": "bottom",
            "text-margin-y": 8,
            width: 16,
            height: 16,
          },
        },
        {
          selector: 'node[type="orphan"]',
          style: { "background-color": "#67716f" },
        },
        {
          selector: 'node[type="unresolved"]',
          style: { "background-color": "#d58a3c", shape: "diamond" },
        },
        {
          selector: "edge",
          style: {
            width: 1,
            "line-color": "#344441",
            "target-arrow-color": "#344441",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
          },
        },
      ],
      layout: {
        name: "cose",
        animate: !paused,
        animationDuration: 500,
        nodeRepulsion: 50000,
        idealEdgeLength: 100,
        fit: true,
        padding: 180,
      },
    });
    cy.on("tap", "node", (e) => {
      const p = e.target.id();
      if (!p.startsWith("?")) onOpen(p);
    });
    return () => cy.destroy();
  }, [index, onOpen, localPath, depth, paused]);
  return (
    <section className="graph-view">
      <div className="floating-graph-tools">
        <label>
          Depth{" "}
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
          >
            <option>1</option>
            <option>2</option>
            <option>3</option>
          </select>
        </label>
        <button onClick={() => setPaused(!paused)}>
          {paused ? "Resume layout" : "Pause layout"}
        </button>
      </div>
      <div
        className="graph-canvas"
        ref={ref}
        aria-label="Interactive note graph"
      />
      <details className="graph-alternative">
        <summary>Accessible graph list</summary>
        {index?.notes.map((n) => (
          <button onClick={() => onOpen(n.path)} key={n.path}>
            {n.title} — {n.links.length} outgoing links
          </button>
        ))}
      </details>
      <div className="graph-legend">
        <span>
          <i className="linked" /> Linked
        </span>
        <span>
          <i className="orphan" /> Orphan
        </span>
        <span>
          <i className="unresolved" /> Unresolved
        </span>
      </div>
    </section>
  );
}

function Backlinks({
  index,
  path,
  onOpen,
}: {
  index: VaultIndex | null;
  path?: string;
  onOpen: (p: string) => void;
}) {
  const current = index?.notes.find((n) => n.path === path);
  const names = new Set([
    current?.title.toLowerCase(),
    path?.replace(/\.md$/, "").toLowerCase(),
    path?.split("/").pop()?.replace(/\.md$/, "").toLowerCase(),
  ]);
  const back =
    index?.notes.filter((n) =>
      n.links.some((l) => names.has(l.target.toLowerCase())),
    ) || [];
  return (
    <section className="content-view">
      <div className="view-header">
        <div>
          <span className="eyebrow">CONNECTIONS</span>
          <h2>Backlinks</h2>
          <p>
            {current
              ? `Notes pointing to ${current.title}`
              : "Open a note to inspect its connections."}
          </p>
        </div>
      </div>
      <div className="results">
        {back.map((n) => (
          <button
            className="result-card"
            key={n.path}
            onClick={() => onOpen(n.path)}
          >
            <Link2 />
            <div>
              <strong>{n.title}</strong>
              <span>{n.path}</span>
              <p>{excerpt(n.content, current?.title || "")}</p>
            </div>
          </button>
        ))}
        {current && !back.length && (
          <div className="empty-state compact">
            <Link2 />
            <h3>No backlinks yet</h3>
            <p>
              Create <code>[[{current.title}]]</code> in another note to connect
              it.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function AIStudio({
  doc,
  index,
  provider,
  onProvider,
  providers,
  onPreview,
}: {
  doc: NoteDocument | null;
  index: VaultIndex | null;
  provider: AIProvider;
  onProvider: (p: AIProvider) => void;
  providers: AIProvider[];
  onPreview: (text: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState("note");
  const [mode, setMode] = useState<"ask" | "suggest" | "edit">("ask");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (text = prompt) => {
    if (!doc) return;
    setBusy(true);
    setResult("");
    try {
      const contexts = [
        {
          label: doc.relativePath,
          content:
            scope === "selection"
              ? "No text selection was provided."
              : doc.content,
        },
      ];
      if (scope === "linked") {
        const active = index?.notes.find((n) => n.path === doc.relativePath);
        for (const link of active?.links || []) {
          const n = index?.notes.find(
            (x) => x.title.toLowerCase() === link.target.toLowerCase(),
          );
          if (n) contexts.push({ label: n.path, content: n.content });
        }
      }
      const r = await window.lattice.ai({
        provider,
        prompt: text,
        context: contexts,
      });
      setResult(r.text);
    } catch (e) {
      setResult(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="ai-studio content-view">
      <div className="view-header">
        <div>
          <span className="eyebrow">EXPLICIT CONTEXT</span>
          <h2>AI workspace</h2>
          <p>
            Ask, review suggestions, or prepare an edit. Files never change
            until you apply.
          </p>
        </div>
        <div className={`processing-badge ${provider.kind}`}>
          {provider.kind === "local" ? <HardDrive /> : <Globe2 />}
          {provider.kind === "local" ? "Local processing" : "Online processing"}
        </div>
      </div>
      <div className="ai-controls">
        <label>
          Provider & model
          <select
            value={provider.id}
            onChange={(e) =>
              onProvider(providers.find((p) => p.id === e.target.value)!)
            }
          >
            {providers.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name} · {p.model}
              </option>
            ))}
          </select>
        </label>
        <label>
          Context leaving the editor
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="note">Active note</option>
            <option value="selection">Selected text</option>
            <option value="linked">Active + directly linked notes</option>
          </select>
        </label>
      </div>
      {provider.kind === "online" && (
        <div className="privacy-callout">
          <Globe2 />
          <div>
            <strong>This request leaves your computer</strong>
            <span>
              Only the context shown above is sent. Lattice never sends the
              whole vault by default.
            </span>
          </div>
        </div>
      )}
      <div className="mode-tabs" role="tablist">
        {(["ask", "suggest", "edit"] as const).map((m) => (
          <button
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
            key={m}
          >
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="quick-actions">
        {actions.map((a) => (
          <button
            onClick={() => {
              setPrompt(a);
              run(a);
            }}
            key={a}
          >
            {a}
          </button>
        ))}
      </div>
      <label className="prompt-box">
        <span>Instructions</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={
            doc
              ? "What would you like to do with this note?"
              : "Open a note to begin."
          }
        />
        <button
          className="primary"
          disabled={!doc || !prompt || busy}
          onClick={() => run()}
        >
          {busy ? <LoaderCircle className="spin" /> : <Sparkles />}
          {busy
            ? "Working…"
            : mode === "ask"
              ? "Ask"
              : mode === "suggest"
                ? "Generate suggestion"
                : "Prepare edit"}
        </button>
      </label>
      {result && (
        <div className="ai-result">
          <div className="result-title">
            <strong>{mode === "ask" ? "Answer" : "Review output"}</strong>
            <span>
              {provider.name} · {provider.model}
            </span>
          </div>
          <pre>{result}</pre>
          {mode !== "ask" && (
            <div className="result-actions">
              <button onClick={() => navigator.clipboard.writeText(result)}>
                <Copy /> Copy
              </button>
              <button className="primary" onClick={() => onPreview(result)}>
                <Check /> Preview change
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ModelLibrary({
  providers,
  setProviders,
}: {
  providers: AIProvider[];
  setProviders: (p: AIProvider[]) => void;
}) {
  const [editing, setEditing] = useState<AIProvider | null>(null);
  const save = async () => {
    if (!editing) return;
    if (editing.kind === "online") {
      const key = (document.getElementById("api-key") as HTMLInputElement)
        ?.value;
      if (key) await window.lattice.secretSet(editing.id, key);
    }
    setProviders(
      providers.map((p) =>
        p.id === editing.id ? { ...editing, configured: true } : p,
      ),
    );
    setEditing(null);
  };
  return (
    <section className="content-view models">
      <div className="view-header">
        <div>
          <span className="eyebrow">LOCAL + ONLINE</span>
          <h2>Model & Provider Library</h2>
          <p>Know where your words are processed before you send them.</p>
        </div>
      </div>
      <h3>Configured routes</h3>
      <div className="model-grid">
        {providers.map((p) => (
          <article className="model-card" key={p.id}>
            <div className={`model-icon ${p.kind}`}>
              {p.kind === "local" ? <HardDrive /> : <Globe2 />}
            </div>
            <div>
              <span className="model-kind">
                {p.kind === "local" ? "ON THIS COMPUTER" : "EXTERNAL PROVIDER"}
              </span>
              <h4>{p.name}</h4>
              <p>{p.model}</p>
              <small>{p.baseUrl}</small>
            </div>
            <button onClick={() => setEditing({ ...p })}>Configure</button>
          </article>
        ))}
      </div>
      <div className="library-heading">
        <div>
          <h3>Compatible local model picks</h3>
          <p>
            Curated GGUF models for an OpenAI-compatible runtime such as LM
            Studio. Downloads and runtime management happen in that runtime in
            this release.
          </p>
        </div>
        <span className="status-pill">
          <ShieldCheck /> Compatibility curated
        </span>
      </div>
      <div className="model-grid curated">
        {[
          {
            n: "Qwen3 4B Instruct",
            pub: "Qwen",
            size: "~2.5 GB",
            ram: "6 GB RAM",
            license: "Apache-2.0",
            cap: "Writing · multilingual",
          },
          {
            n: "Gemma 3 4B IT",
            pub: "Google",
            size: "~3.0 GB",
            ram: "7 GB RAM",
            license: "Gemma",
            cap: "Writing · analysis",
          },
          {
            n: "Mistral Nemo 12B",
            pub: "Mistral AI",
            size: "~7.5 GB",
            ram: "12 GB RAM",
            license: "Apache-2.0",
            cap: "Long context · writing",
          },
        ].map((m) => (
          <article className="model-card catalog" key={m.n}>
            <div className="model-icon local">
              <BrainCircuit />
            </div>
            <div>
              <span className="model-kind">GGUF · Q4_K_M</span>
              <h4>{m.n}</h4>
              <p>
                {m.pub} · {m.cap}
              </p>
              <div className="specs">
                <span>{m.size}</span>
                <span>{m.ram}</span>
                <span>{m.license}</span>
              </div>
            </div>
            <a
              href={`https://huggingface.co/models?search=${encodeURIComponent(m.n + " GGUF")}`}
              target="_blank"
              rel="noreferrer"
            >
              View source
            </a>
          </article>
        ))}
      </div>
      {editing && (
        <div className="modal-scrim" onMouseDown={() => setEditing(null)}>
          <dialog
            open
            onMouseDown={(e) => e.stopPropagation()}
            aria-labelledby="provider-title"
          >
            <header>
              <div>
                <span className="eyebrow">PROVIDER ROUTE</span>
                <h3 id="provider-title">Configure {editing.name}</h3>
              </div>
              <IconButton label="Close" onClick={() => setEditing(null)}>
                <X />
              </IconButton>
            </header>
            <label>
              Name
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </label>
            <label>
              Base URL
              <input
                value={editing.baseUrl}
                onChange={(e) =>
                  setEditing({ ...editing, baseUrl: e.target.value })
                }
              />
              <small>
                Must expose an OpenAI-compatible <code>/chat/completions</code>{" "}
                endpoint.
              </small>
            </label>
            <label>
              Model identifier
              <input
                value={editing.model}
                onChange={(e) =>
                  setEditing({ ...editing, model: e.target.value })
                }
              />
            </label>
            {editing.kind === "online" && (
              <label>
                API key
                <input
                  id="api-key"
                  type="password"
                  autoComplete="off"
                  placeholder="Stored encrypted with Windows secure storage"
                />
              </label>
            )}
            <footer>
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button className="primary" onClick={save}>
                <Save /> Save route
              </button>
            </footer>
          </dialog>
        </div>
      )}
    </section>
  );
}

function SettingsView() {
  const [spell, setSpell] = useState(
    localStorage.getItem("spellcheck") !== "false",
  );
  const [restore, setRestore] = useState(
    localStorage.getItem("restore") !== "false",
  );
  const toggle = (k: string, v: boolean, set: (v: boolean) => void) => {
    localStorage.setItem(k, String(v));
    set(v);
  };
  return (
    <section className="content-view settings-view">
      <div className="view-header">
        <div>
          <span className="eyebrow">PREFERENCES</span>
          <h2>Settings</h2>
          <p>Workspace behavior, editing, privacy, and recovery.</p>
        </div>
      </div>
      <div className="settings-grid">
        <section>
          <h3>Workspace</h3>
          <label className="setting-row">
            <div>
              <strong>Restore workspace at startup</strong>
              <span>Reopen the last vault and tabs.</span>
            </div>
            <input
              type="checkbox"
              checked={restore}
              onChange={(e) => toggle("restore", e.target.checked, setRestore)}
            />
          </label>
          <label className="setting-row">
            <div>
              <strong>Spellcheck</strong>
              <span>Use Chromium’s local spellchecker in editable fields.</span>
            </div>
            <input
              type="checkbox"
              checked={spell}
              onChange={(e) => toggle("spellcheck", e.target.checked, setSpell)}
            />
          </label>
        </section>
        <section>
          <h3>Files & recovery</h3>
          <div className="setting-row">
            <div>
              <strong>AI snapshots</strong>
              <span>
                Created before every applied AI edit inside{" "}
                <code>.lattice/history</code>.
              </span>
            </div>
            <span className="status-pill">
              <Check /> On
            </span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Safe deletion</strong>
              <span>
                Deleted notes and folders go to the Windows Recycle Bin.
              </span>
            </div>
            <span className="status-pill">
              <Check /> On
            </span>
          </div>
        </section>
        <section>
          <h3>Privacy</h3>
          <div className="setting-row">
            <div>
              <strong>Online context approval</strong>
              <span>
                The exact scope is visible before every external request.
              </span>
            </div>
            <span className="status-pill">
              <Check /> Required
            </span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Conversation history</strong>
              <span>Chats are not persisted in this release.</span>
            </div>
            <span className="status-pill neutral">Off</span>
          </div>
        </section>
      </div>
    </section>
  );
}

export default function App() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [active, setActive] = useState<Vault | null>(null);
  const [view, setView] = useState<View>("vaults");
  const [tree, setTree] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<FileEntry>();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [tab, setTab] = useState<string>();
  const [doc, setDoc] = useState<NoteDocument | null>(null);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<"source" | "read">("read");
  const [status, setStatus] = useState<
    "saved" | "saving" | "error" | "conflict"
  >("saved");
  const [index, setIndex] = useState<VaultIndex | null>(null);
  const [right, setRight] = useState(false);
  const [providers, setProvidersState] = useState<AIProvider[]>(() => {
    try {
      return (
        JSON.parse(localStorage.getItem("providers") || "null") ||
        defaultProviders
      );
    } catch {
      return defaultProviders;
    }
  });
  const [provider, setProvider] = useState(providers[0]);
  const [preview, setPreview] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const setProviders = (p: AIProvider[]) => {
    setProvidersState(p);
    localStorage.setItem("providers", JSON.stringify(p));
    const current = p.find((x) => x.id === provider.id);
    if (current) setProvider(current);
  };
  const refresh = useCallback(async () => {
    if (!active) return;
    setTree(await window.lattice.tree(active.id));
    setIndex(await window.lattice.search(active.id));
  }, [active]);
  useEffect(() => {
    window.lattice.listVaults().then((v) => {
      setVaults(v);
      if (localStorage.getItem("restore") !== "false") {
        const id = localStorage.getItem("activeVault");
        const found = v.find((x) => x.id === id && x.available);
        if (found) {
          setActive(found);
          setView("files");
        }
      }
    });
  }, []);
  useEffect(() => {
    if (active) {
      localStorage.setItem("activeVault", active.id);
      refresh();
    } else {
      setTree([]);
      setIndex(null);
    }
  }, [active, refresh]);
  useEffect(
    () =>
      window.lattice.onExternalChange(async (p) => {
        if (p === tab && doc) {
          setStatus("conflict");
        }
        await refresh();
      }),
    [tab, doc, refresh],
  );
  const openNote = useCallback(
    async (path: string) => {
      if (!active) return;
      try {
        const next = await window.lattice.read(active.id, path);
        setDoc(next);
        setDraft(next.content);
        setTab(path);
        setTabs((t) => (t.some((x) => x.path === path) ? t : [...t, { path }]));
        setView("files");
        setStatus("saved");
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [active],
  );
  const change = (value: string) => {
    setDraft(value);
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      if (!active || !doc) return;
      try {
        const saved = await window.lattice.write(
          active.id,
          doc.relativePath,
          value,
          doc.mtimeMs,
        );
        setDoc(saved);
        setStatus("saved");
        await refresh();
      } catch (e) {
        setStatus(
          (e as Error).message.includes("CONFLICT") ? "conflict" : "error",
        );
      }
    }, 650);
  };
  const addVault = async (m: "create" | "open", s?: boolean) => {
    const v = await window.lattice.chooseVault(m, s);
    if (v) {
      setVaults(await window.lattice.listVaults());
      setActive(v);
      setView("files");
    }
  };
  const openVault = (v: Vault) => {
    if (!v.available) {
      addVault("open");
      return;
    }
    setActive(v);
    setView("files");
    setTabs([]);
    setTab(undefined);
    setDoc(null);
  };
  const mutate = async (
    action: "create-file" | "create-folder" | "rename" | "duplicate" | "delete",
  ) => {
    if (!active) return;
    try {
      if (action.startsWith("create")) {
        const parent =
          selected?.kind === "folder"
            ? selected.relativePath
            : selected
              ? selected.relativePath.split("/").slice(0, -1).join("/")
              : "";
        const p = await window.lattice.createEntry(
          active.id,
          parent,
          action === "create-file" ? "file" : "folder",
        );
        if (action === "create-file") await openNote(p);
      } else if (selected) {
        if (action === "rename") {
          const name = prompt("New name", selected.name);
          if (name) {
            const impact =
              selected.kind === "file"
                ? await window.lattice.renameImpact(
                    active.id,
                    selected.relativePath,
                  )
                : [];
            const update = impact.length
              ? confirm(
                  `${impact.length} note${impact.length === 1 ? "" : "s"} link to this note:\n\n${impact.slice(0, 8).join("\n")}\n\nUpdate those links? Recoverable snapshots will be created.`,
                )
              : false;
            const result = await window.lattice.renameEntry(
              active.id,
              selected.relativePath,
              name,
              update,
            );
            setSelected(undefined);
            if (selected.kind === "file") await openNote(result.path);
          }
        }
        if (action === "duplicate")
          await window.lattice.duplicateEntry(active.id, selected.relativePath);
        if (
          action === "delete" &&
          confirm(`Move “${selected.name}” to the Windows Recycle Bin?`)
        ) {
          await window.lattice.deleteEntry(active.id, selected.relativePath);
          if (tab === selected.relativePath) {
            setDoc(null);
            setTab(undefined);
          }
          setSelected(undefined);
        }
      }
      await refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const closeTab = (p: string) => {
    const next = tabs.filter((x) => x.path !== p);
    setTabs(next);
    if (tab === p) {
      const n = next.at(-1);
      if (n) openNote(n.path);
      else {
        setTab(undefined);
        setDoc(null);
      }
    }
  };
  const applyPreview = async () => {
    if (!active || !doc || preview === null) return;
    await window.lattice.snapshot(
      active.id,
      doc.relativePath,
      draft,
      "ai-edit",
    );
    change(preview);
    setPreview(null);
  };
  const title = doc
    ? index?.notes.find((n) => n.path === doc.relativePath)?.title ||
      doc.relativePath.split("/").pop()?.replace(/\.md$/, "")
    : "No note open";
  if (!active || view === "vaults")
    return (
      <div className="app">
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <VaultManager
          vaults={vaults}
          onOpen={openVault}
          onAdd={addVault}
          onRemove={async (v) => {
            if (
              confirm(
                `Remove “${v.name}” from Lattice Notes? Its files will stay on disk.`,
              )
            ) {
              await window.lattice.removeVault(v.id);
              setVaults(await window.lattice.listVaults());
            }
          }}
          onUpdate={async (v) => setVaults(await window.lattice.updateVault(v))}
        />
      </div>
    );
  return (
    <div className={`app shell ${view !== "files" ? "no-sidebar" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <ActivityRail
        view={view}
        setView={setView}
        openVaults={() => setView("vaults")}
      />
      {view === "files" && (
        <Sidebar
          vault={active}
          tree={tree}
          selected={selected}
          onSelect={setSelected}
          onOpen={openNote}
          onCreate={(k) =>
            mutate(k === "file" ? "create-file" : "create-folder")
          }
          onRename={() => mutate("rename")}
          onDuplicate={() => mutate("duplicate")}
          onDelete={() => mutate("delete")}
          onRefresh={refresh}
        />
      )}
      <div className="workspace">
        <div className="title-spacer" />
        <div className="tabbar">
          <div className="history-controls">
            <IconButton label="Back">
              <ArrowLeft />
            </IconButton>
            <IconButton label="Forward">
              <ArrowRight />
            </IconButton>
          </div>
          {tabs.map((t) => (
            <button
              className={`tab ${t.path === tab ? "active" : ""}`}
              onClick={() => openNote(t.path)}
              key={t.path}
            >
              <File />
              <span>{t.path.split("/").pop()?.replace(/\.md$/, "")}</span>
              <span
                className="tab-close"
                role="button"
                aria-label={`Close ${t.path}`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.path);
                }}
              >
                <X />
              </span>
            </button>
          ))}
          <IconButton label="New note" onClick={() => mutate("create-file")}>
            <Plus />
          </IconButton>
          <div className="tab-spacer" />
          <IconButton
            label="Toggle AI panel"
            active={right}
            onClick={() => setRight(!right)}
          >
            <PanelRight />
          </IconButton>
        </div>
        {view === "files" && (
          <main className="note-workspace" id="main-content">
            {doc ? (
              <>
                <header className="note-toolbar">
                  <div className="breadcrumbs">
                    <span>{active.name}</span>
                    <ChevronRight />
                    <strong>{title}</strong>
                  </div>
                  <div className="note-actions">
                    <span className={`save-status ${status}`}>
                      {status === "saving" ? (
                        <LoaderCircle className="spin" />
                      ) : status === "saved" ? (
                        <Check />
                      ) : status === "conflict" ? (
                        <RefreshCw />
                      ) : (
                        <WifiOff />
                      )}
                      {status === "saved"
                        ? "Saved to disk"
                        : status === "saving"
                          ? "Saving…"
                          : status === "conflict"
                            ? "Changed on disk"
                            : "Save failed"}
                    </span>
                    <div className="segmented text">
                      <button
                        className={mode === "source" ? "active" : ""}
                        onClick={() => setMode("source")}
                      >
                        Source
                      </button>
                      <button
                        className={mode === "read" ? "active" : ""}
                        onClick={() => setMode("read")}
                      >
                        Reading
                      </button>
                    </div>
                    <IconButton label="Version history">
                      <History />
                    </IconButton>
                  </div>
                </header>
                {status === "conflict" && (
                  <div className="conflict-banner" role="alert">
                    <RefreshCw />
                    <div>
                      <strong>This note changed outside Lattice Notes.</strong>
                      <span>
                        Your editor content is preserved. Reload the disk
                        version, or copy your draft before continuing.
                      </span>
                    </div>
                    <button onClick={() => doc && openNote(doc.relativePath)}>
                      Reload disk version
                    </button>
                  </div>
                )}
                <div className="document-scroll">
                  <div className="document-title">
                    <h1>{title}</h1>
                    <span>{doc.relativePath}</span>
                  </div>
                  <MarkdownView
                    doc={{ ...doc, content: draft }}
                    mode={mode}
                    onChange={change}
                    vault={active}
                  />
                </div>
              </>
            ) : (
              <div className="empty-note">
                <div className="empty-logo">
                  <Logo size={56} />
                </div>
                <h1>Make a connection.</h1>
                <p>
                  Create a note, open an existing Markdown file, or explore how
                  this vault fits together.
                </p>
                <div>
                  <button
                    className="primary"
                    onClick={() => mutate("create-file")}
                  >
                    <FilePlus2 /> New note
                  </button>
                  <button onClick={() => setView("graph")}>
                    <Network /> Open graph
                  </button>
                </div>
                <kbd>Ctrl + N</kbd>
              </div>
            )}
          </main>
        )}
        {view === "search" && <SearchView index={index} onOpen={openNote} />}{" "}
        {view === "graph" && <GraphView index={index} onOpen={openNote} />}{" "}
        {view === "backlinks" && (
          <Backlinks index={index} path={tab} onOpen={openNote} />
        )}{" "}
        {view === "ai" && (
          <AIStudio
            doc={doc ? { ...doc, content: draft } : null}
            index={index}
            provider={provider}
            onProvider={setProvider}
            providers={providers}
            onPreview={setPreview}
          />
        )}{" "}
        {view === "models" && (
          <ModelLibrary providers={providers} setProviders={setProviders} />
        )}{" "}
        {view === "settings" && <SettingsView />}
      </div>
      {right && (
        <aside className="right-panel">
          <header>
            <div>
              <span className="eyebrow">NOTE ASSISTANT</span>
              <strong>{title}</strong>
            </div>
            <IconButton label="Close AI panel" onClick={() => setRight(false)}>
              <X />
            </IconButton>
          </header>
          <AIStudio
            doc={doc ? { ...doc, content: draft } : null}
            index={index}
            provider={provider}
            onProvider={setProvider}
            providers={providers}
            onPreview={setPreview}
          />
        </aside>
      )}
      {preview !== null && (
        <div className="modal-scrim">
          <dialog open className="diff-dialog" aria-labelledby="diff-title">
            <header>
              <div>
                <span className="eyebrow">RECOVERABLE AI CHANGE</span>
                <h3 id="diff-title">Review edit before applying</h3>
              </div>
              <IconButton label="Reject edit" onClick={() => setPreview(null)}>
                <X />
              </IconButton>
            </header>
            <div className="diff-grid">
              <section>
                <h4>Current note</h4>
                <pre>{draft}</pre>
              </section>
              <section>
                <h4>Proposed note</h4>
                <pre>{preview}</pre>
              </section>
            </div>
            <footer>
              <span>
                <ArchiveRestore /> A snapshot will be created before this edit.
              </span>
              <button onClick={() => setPreview(null)}>Reject</button>
              <button className="primary" onClick={applyPreview}>
                <Check /> Apply change
              </button>
            </footer>
          </dialog>
        </div>
      )}
    </div>
  );
}
