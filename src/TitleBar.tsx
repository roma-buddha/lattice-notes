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
import { stem } from "./notus";
import logo from "../icon.svg";
export type TabTransfer = { path: string; source?: string; id?: number };
export type NoteTab = { id: number; path: string | null; organizer?: boolean };
export function TitleBar({
  sidebar,
  toggleSidebar,
  tabs,
  active,
  selectTab,
  closeTab,
  dropTab,
  detachTab,
  theme,
  toggleTheme,
  onError,
  split,
  tabContext,
  settings,
}: {
  sidebar: boolean;
  toggleSidebar: () => void;
  tabs: NoteTab[];
  active: number;
  selectTab: (id: number) => void;
  closeTab: (id: number) => void;
  dropTab: (transfer: TabTransfer, before?: number) => void;
  detachTab: (id: number, atCursor: boolean) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onError: (error: string) => void;
  split: (button: HTMLElement) => void;
  tabContext: (id: number, event: React.MouseEvent) => void;
  settings: () => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
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
      if (value) dropTab(JSON.parse(value) as TabTransfer, before);
      else if (event.dataTransfer.getData("text/notus-kind") === "note")
        dropTab(
          { path: event.dataTransfer.getData("text/notus-path") },
          before,
        );
    } catch {
      onError("Could not open the dragged tab.");
    }
  };
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
    <header className="unified-titlebar" data-tauri-drag-region>
      <div className="title-navigation" data-tauri-drag-region>
        <span className="title-brand" data-tauri-drag-region>
          <img src={logo} alt="" data-tauri-drag-region />
          <span data-tauri-drag-region>Lotus</span>
        </span>
        <button
          className="icon"
          aria-label={`${sidebar ? "Collapse" : "Expand"} sidebar (Ctrl+B)`}
          title="Toggle sidebar"
          onClick={toggleSidebar}
        >
          {sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <button
          className="icon quick-theme"
          aria-label={
            theme === "light" ? "Switch to dark theme" : "Switch to light theme"
          }
          title="Switch appearance"
          onClick={toggleTheme}
        >
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </button>
        <button
          className="icon"
          aria-label="Split view"
          title="Split view"
          onClick={(e) => split(e.currentTarget)}
        >
          <Columns2 size={17} />
        </button>
        <button
          className="icon"
          aria-label="Settings"
          title="Settings"
          onClick={settings}
        >
          <Settings size={17} />
        </button>
      </div>
      <div
        className={`tab-strip ${dragOver ? "tab-drop-target" : ""}`}
        ref={strip}
        onWheel={(event) => {
          if (strip.current)
            strip.current.scrollLeft += event.deltaY || event.deltaX;
        }}
        data-tauri-drag-region
        role="tablist"
        aria-label="Open notes"
        onDragOver={(event) => {
          if (
            event.dataTransfer.types.includes("application/notus-tab") ||
            event.dataTransfer.types.includes("notus-note")
          ) {
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            setDragOver(true);
          }
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => accept(event)}
      >
        {tabs.map((tab) => (
          <div
            className={`note-tab ${tab.id === active ? "active" : ""}`}
            key={tab.id}
            data-tab-id={tab.id}
            onContextMenu={(e) => {
              e.preventDefault();
              tabContext(tab.id, e);
            }}
            draggable={!!tab.path}
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
            onDragEnd={(event) => {
              setDragOver(false);
              if (event.dataTransfer.dropEffect === "none")
                detachTab(tab.id, true);
            }}
            onDrop={(event) => accept(event, tab.id)}
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
