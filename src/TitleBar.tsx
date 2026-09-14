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
  Globe2,
  Settings,
  X,
} from "lucide-react";
import { api, stem } from "./notus";
import logo from "../icon.svg";
import type { BrowserSession } from "./browserSession";
export type TabTransfer = {
  path?: string;
  source?: string;
  id?: number;
  targetX?: number;
};
export type NoteTab = {
  id: number;
  path: string | null;
  pinned?: boolean;
  organizer?: boolean;
  release?: boolean;
  browser?: BrowserSession;
};
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
  browser,
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
  browser: () => void;
  compact?: boolean;
}) {
  const [maximized, setMaximized] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [insert, setInsert] = useState<{ id: number; before: boolean } | null>(
    null,
  );
  const strip = useRef<HTMLDivElement>(null);
  const handledDrag = useRef<number | null>(null);
  const pointerTab = useRef<{
    id: number;
    pointerId: number;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);
  const suppressTabClick = useRef(false);
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
  useEffect(() => {
    const receivePointerDrop = (event: Event) => {
      const detail = (
        event as CustomEvent<{ path?: unknown; target?: unknown }>
      ).detail;
      if (
        detail?.target !== "tabs" ||
        typeof detail.path !== "string" ||
        !detail.path
      )
        return;
      // This is deliberately separate from HTML DnD.  It is the dependable
      // same-window route when WebView2 declines to surface DataTransfer data.
      dropTab({ path: detail.path });
    };
    window.addEventListener("lotus-note-pointer-drop", receivePointerDrop);
    return () =>
      window.removeEventListener("lotus-note-pointer-drop", receivePointerDrop);
  }, [dropTab]);
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
        const raw =
          event.dataTransfer.getData("application/x-lotus-note") ||
          event.dataTransfer.getData("text/plain");
        let payload: { path?: string; kind?: string } | null = null;
        try {
          payload = raw
            ? (JSON.parse(raw) as { path?: string; kind?: string })
            : null;
        } catch {
          payload = null;
        }
        const path =
          payload?.kind === "note" && typeof payload.path === "string"
            ? payload.path
            : event.dataTransfer.getData("text/notus-kind") === "note"
              ? event.dataTransfer.getData("text/notus-path")
              : "";
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
        void api
          .registerTabStrip({
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          })
          .catch(() => {});
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
      listeners.forEach(
        (listener) => void listener.then((unlisten) => unlisten()),
      );
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
        {!compact && (
          <button
            className="icon"
            aria-label={`${sidebar ? "Collapse" : "Expand"} sidebar (Ctrl+B)`}
            title="Toggle sidebar"
            onClick={toggleSidebar}
          >
            {sidebar ? (
              <PanelLeftClose size={17} />
            ) : (
              <PanelLeftOpen size={17} />
            )}
          </button>
        )}
        {!compact && (
          <button
            className="icon quick-theme"
            aria-label={
              theme === "light"
                ? "Switch to dark theme"
                : "Switch to light theme"
            }
            title="Switch appearance"
            onClick={toggleTheme}
          >
            {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        )}
        {!compact && (
          <button
            className="icon"
            aria-label="Split view"
            title="Split view"
            onClick={(e) => split(e.currentTarget)}
          >
            <Columns2 size={17} />
          </button>
        )}
        {!compact && (
          <button
            className="icon"
            aria-label="Settings"
            title="Settings"
            onClick={settings}
          >
            <Settings size={17} />
          </button>
        )}
        {!compact && (
          <button
            className="icon"
            aria-label="Open browser tab"
            title="Open browser"
            onClick={browser}
          >
            <Globe2 size={17} />
          </button>
        )}
      </div>
      <div
        className={`tab-strip ${dragOver ? "tab-drop-target" : ""}`}
        ref={strip}
        data-tauri-drag-region
        data-lotus-drop="tabs"
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
            event.dataTransfer.dropEffect = event.dataTransfer.types.includes(
              "notus-note",
            )
              ? "copy"
              : "move";
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
            className={`note-tab ${tab.pinned ? "pinned-tab" : ""} ${tab.id === active ? "active" : ""} ${insert?.id === tab.id ? (insert.before ? "tab-insert-before" : "tab-insert-after") : ""}`}
            key={tab.id}
            data-tab-id={tab.id}
            data-pinned={tab.pinned || undefined}
            onContextMenu={(e) => {
              e.preventDefault();
              if (!tab.pinned) tabContext(tab.id, e);
            }}
            draggable={false}
            onPointerDown={(event) => {
              if (
                tab.pinned ||
                (!tab.path && !tab.browser) ||
                event.button !== 0 ||
                (event.target as HTMLElement).closest(".tab-close")
              )
                return;
              pointerTab.current = {
                id: tab.id,
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                active: false,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const drag = pointerTab.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              if (!drag.active) {
                if (
                  Math.hypot(
                    event.clientX - drag.startX,
                    event.clientY - drag.startY,
                  ) < 7
                )
                  return;
                drag.active = true;
                suppressTabClick.current = true;
              }
              const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>("[data-tab-id]");
              if (!target) return;
              if (target?.dataset.pinned) return;
              const targetId = Number(target.dataset.tabId);
              if (!Number.isFinite(targetId) || targetId === drag.id) return;
              const rect = target.getBoundingClientRect();
              setInsert({
                id: targetId,
                before: event.clientX < rect.left + rect.width / 2,
              });
            }}
            onPointerUp={(event) => {
              const drag = pointerTab.current;
              if (!drag || drag.pointerId !== event.pointerId) return;
              pointerTab.current = null;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
              if (!drag.active) return;
              const target = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest<HTMLElement>("[data-tab-id], [data-lotus-drop]");
              if (
                target?.dataset.lotusDrop === "primary-pane" ||
                target?.dataset.lotusDrop === "secondary-pane"
              ) {
                window.dispatchEvent(
                  new CustomEvent(
                    tab.browser
                      ? "lotus-browser-pointer-drop"
                      : "lotus-note-pointer-drop",
                    {
                      detail: tab.browser
                        ? {
                            browserId: tab.browser.id,
                            target: target.dataset.lotusDrop,
                          }
                        : { path: tab.path, target: target.dataset.lotusDrop },
                    },
                  ),
                );
                setInsert(null);
                window.setTimeout(() => {
                  suppressTabClick.current = false;
                }, 0);
                return;
              }
              if (target?.dataset.pinned) {
                setInsert(null);
                return;
              }
              const targetId = Number(target?.dataset.tabId);
              if (Number.isFinite(targetId) && targetId !== drag.id) {
                const rect = target!.getBoundingClientRect();
                const index = tabs.findIndex(
                  (candidate) => candidate.id === targetId,
                );
                const before =
                  event.clientX < rect.left + rect.width / 2
                    ? targetId
                    : tabs[index + 1]?.id;
                dropTab(
                  {
                    id: drag.id,
                    path: tab.path ?? undefined,
                    source: getCurrentWindow().label,
                  },
                  before,
                );
              }
              setInsert(null);
              window.setTimeout(() => {
                suppressTabClick.current = false;
              }, 0);
            }}
            onDragOver={(event) => {
              if (
                event.dataTransfer.types.includes("application/notus-tab") ||
                event.dataTransfer.types.includes("application/x-lotus-note") ||
                event.dataTransfer.types.includes("notus-note") ||
                event.dataTransfer.types.includes("text/plain")
              ) {
                event.preventDefault();
                event.stopPropagation();
                if (!tab.pinned) {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setInsert({
                    id: tab.id,
                    before: event.clientX < rect.left + rect.width / 2,
                  });
                }
              }
            }}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setInsert((current) =>
                  current?.id === tab.id ? null : current,
                );
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
              const before = tab.pinned
                ? undefined
                : insert?.id === tab.id && !insert.before
                  ? tabs[
                      tabs.findIndex((candidate) => candidate.id === tab.id) + 1
                    ]?.id
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
              title={
                tab.path ??
                tab.browser?.url ??
                (tab.pinned ? "Current note" : "Organize workspace")
              }
              onClick={(event) => {
                if (suppressTabClick.current) {
                  event.preventDefault();
                  return;
                }
                selectTab(tab.id);
              }}
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
              {tab.browser ? <Globe2 size={14} /> : <FileText size={14} />}
              <span>
                {tab.pinned
                  ? "Current note"
                  : tab.path
                    ? stem(tab.path)
                    : tab.browser
                      ? tab.browser.title
                      : tab.release
                        ? "Release history"
                        : "Organizer"}
              </span>
            </button>
            {(!tab.pinned || tab.path) && (
              <button
                className="tab-close"
                aria-label={
                  tab.pinned
                    ? "Close current note"
                    : `Close tab ${tab.path ? stem(tab.path) : (tab.browser?.title ?? (tab.release ? "Release history" : "Organizer"))}`
                }
                onClick={() => closeTab(tab.id)}
              >
                <X size={13} />
              </button>
            )}
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
