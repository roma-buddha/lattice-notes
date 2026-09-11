import { useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  FileText,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Moon,
  Sun,
  Square,
  Copy,
  Columns2,
  Settings,
  X,
} from "lucide-react";
import { api, stem } from "./notus";
import logo from "../icon.svg";
export type TabTransfer = { path: string; source?: string; id?: number; targetX?: number };
export type NoteTab = { id: number; path: string | null; organizer?: boolean };
export function TitleBar({
  sidebar,
  toggleSidebar,
  tabs,
  active,
  selectTab,
  closeTab,
  dropTab,
  finishTabDrag,
  theme,
  toggleTheme,
  onError,
  split,
  tabContext,
  settings,
  compact = false,
}: {
  sidebar: boolean;
  toggleSidebar: () => void;
  tabs: NoteTab[];
  active: number;
  selectTab: (id: number) => void;
  closeTab: (id: number) => void;
  dropTab: (transfer: TabTransfer, before?: number) => void;
  finishTabDrag: (id: number) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onError: (error: string) => void;
  split: (button: HTMLElement) => void;
  tabContext: (id: number, event: React.MouseEvent) => void;
  settings: () => void;
  compact?: boolean;
}) {
  const [maximized, setMaximized] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [insert, setInsert] = useState<{ id: number; before: boolean } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const handledDrag = useRef<number | null>(null);
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    const reveal = () =>
      element
        .querySelector<HTMLElement>(`[data-tab-id="${active}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(element);
    return () => observer.disconnect();
  }, [active, tabs]);
  const accept = (event: React.DragEvent, before?: number) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const value = event.dataTransfer.getData("application/notus-tab");
    try {
      if (value) {
        const transfer = JSON.parse(value) as TabTransfer;
        handledDrag.current = transfer.id ?? null;
        dropTab(transfer, before);
      } else {
        const raw = event.dataTransfer.getData("application/x-lotus-note") || event.dataTransfer.getData("text/plain");
        let payload: { path?: string; kind?: string } | null = null;
        try {
          payload = raw ? JSON.parse(raw) as { path?: string; kind?: string } : null;
        } catch {
          payload = null;
        }
        const path = payload?.kind === "note" && typeof payload.path === "string" ? payload.path : event.dataTransfer.getData("text/notus-kind") === "note" ? event.dataTransfer.getData("text/notus-path") : "";
        if (path) dropTab({ path }, before);
      }
    } catch {
      onError("Could not open the dragged tab.");
    }
  };
  useEffect(() => {
    const element = strip.current;
    if (!element) return;
    let frame = 0;
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        void api.registerTabStrip({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }).catch(() => {});
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    const window = getCurrentWindow();
    const listeners = [window.onMoved(report), window.onResized(report)];
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      listeners.forEach((listener) => void listener.then((unlisten) => unlisten()));
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    const window = getCurrentWindow();
    const update = () => {
      void window.isMaximized().then((value) => {
        if (!disposed) setMaximized(value);
      });
    };
    update();
    const listener = window.onResized(update);
    return () => {
      disposed = true;
      void listener.then((unlisten) => unlisten());
    };
  }, []);
  const native = (action: () => Promise<void>) => {
    void action().catch((error) => onError(String(error)));
  };
  return (
    <header className={`unified-titlebar ${compact ? "compact-titlebar" : ""}`}>
      <div className="title-navigation" data-tauri-drag-region>
        <span className="title-brand" data-tauri-drag-region>
          <img src={logo} alt="" data-tauri-drag-region />
          <span data-tauri-drag-region>Lotus</span>
        </span>
        {!compact && <button
          className="icon"
          aria-label={`${sidebar ? "Collapse" : "Expand"} sidebar (Ctrl+B)`}
          title="Toggle sidebar"
          onClick={toggleSidebar}
        >
          {sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>}
        {!compact && <button
          className="icon quick-theme"
          aria-label={
            theme === "light" ? "Switch to dark theme" : "Switch to light theme"
          }
          title="Switch appearance"
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>}
        {!compact && <button
          className="icon"
          aria-label="Split view"
          title="Split view"
          onClick={(e) => split(e.currentTarget)}
        >
          <Columns2 size={17} />
        </button>}
        {!compact && <button
          className="icon"
          aria-label="Settings"
          title="Settings"
          onClick={settings}
        >
          <Settings size={17} />
        </button>}
      </div>
      <div
        className={`tab-strip ${dragOver ? "tab-drop-target" : ""}`}
        ref={strip}
        onWheel={(event) => {
          if (strip.current)
            strip.current.scrollLeft += event.deltaY || event.deltaX;
        }}
        role="tablist"
        aria-label="Open notes"
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes("application/notus-tab") ||
            event.dataTransfer.types.includes("application/x-lotus-note") ||
            event.dataTransfer.types.includes("notus-note") ||
            event.dataTransfer.types.includes("text/plain")
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = event.dataTransfer.types.includes("notus-note") ? "copy" : "move";
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          setInsert(null);
          accept(event);
        }}
      >
        {tabs.map((tab) => (
          <div
            className={`note-tab ${tab.id === active ? "active" : ""} ${insert?.id === tab.id ? (insert.before ? "tab-insert-before" : "tab-insert-after") : ""}`}
            key={tab.id}
            data-tab-id={tab.id}
            onContextMenu={(e) => {
              e.preventDefault();
              tabContext(tab.id, e);
            }}
            draggable={!!tab.path}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes("application/notus-tab") ||
                event.dataTransfer.types.includes("application/x-lotus-note") ||
                event.dataTransfer.types.includes("notus-note") ||
                event.dataTransfer.types.includes("text/plain")
              ) {
                event.preventDefault();
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setInsert({ id: tab.id, before: event.clientX < rect.left + rect.width / 2 });
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setInsert((current) => current?.id === tab.id ? null : current);
            }}
            onDragStart={(event) => {
              event.dataTransfer.setData(
                "application/notus-tab",
                JSON.stringify({
                  path: tab.path,
                  id: tab.id,
                  source: getCurrentWindow().label,
                }),
              );
              event.dataTransfer.effectAllowed = "copyMove";
            }}
            onDragEnd={() => {
              setDragOver(false);
              if (handledDrag.current === tab.id) {
                handledDrag.current = null;
                return;
              }
              finishTabDrag(tab.id);
            }}
            onDrop={(event) => {
              const before = insert?.id === tab.id && !insert.before
                ? tabs[tabs.findIndex((candidate) => candidate.id === tab.id) + 1]?.id
                : tab.id;
              setInsert(null);
              accept(event, before);
            }}
          >
            <button
              role="tab"
              aria-selected={tab.id === active}
              aria-controls="editor-workspace"
              tabIndex={tab.id === active ? 0 : -1}
              title={tab.path ?? "Organize workspace"}
              onClick={() => selectTab(tab.id)}
              onKeyDown={(event) => {
                if (
                  ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  const index = tabs.indexOf(tab);
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? tabs.length - 1
                        : (index +
                            (event.key === "ArrowRight" ? 1 : -1) +
                            tabs.length) %
                          tabs.length;
                  selectTab(tabs[next].id);
                  const buttons = event.currentTarget
                    .closest('[role="tablist"]')
                    ?.querySelectorAll<HTMLElement>('[role="tab"]');
                  buttons?.[next]?.focus();
                }
              }}
            >
              <FileText size={14} />
              <span>{tab.path ? stem(tab.path) : "Organizer"}</span>
            </button>
            {
              <button
                className="tab-close"
                aria-label={`Close tab ${tab.path ? stem(tab.path) : "Organizer"}`}
                onClick={() => closeTab(tab.id)}
              >
                <X size={13} />
              </button>
            }
          </div>
        ))}
      </div>
      <div className="title-drag-space" data-tauri-drag-region />
      <div className="window-controls">
        <button
          aria-label="Minimize window"
          title="Minimize"
          onClick={() => native(() => getCurrentWindow().minimize())}
        >
          <Minus size={14} />
        </button>
        <button
          aria-label={maximized ? "Restore window" : "Maximize window"}
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => native(() => getCurrentWindow().toggleMaximize())}
        >
          {maximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          className="window-close"
          aria-label="Close window"
          title="Close"
          onClick={() => native(() => getCurrentWindow().close())}
        >
          <X size={16} />
        </button>
      </div>
    </header>
  );
}
