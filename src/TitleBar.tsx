import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  FileText,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Square,
  Copy,
  X,
} from "lucide-react";
import { stem } from "./notus";
export type NoteTab = { id: number; path: string | null };
export function TitleBar({
  sidebar,
  toggleSidebar,
  search,
  tabs,
  active,
  selectTab,
  closeTab,
  newTab,
  status,
  onError,
}: {
  sidebar: boolean;
  toggleSidebar: () => void;
  search: () => void;
  tabs: NoteTab[];
  active: number;
  selectTab: (id: number) => void;
  closeTab: (id: number) => void;
  newTab: () => void;
  status: string;
  onError: (error: string) => void;
}) {
  const [maximized, setMaximized] = useState(false);
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
        <button
          className="icon"
          aria-label={`${sidebar ? "Collapse" : "Expand"} sidebar (Ctrl+B)`}
          title="Toggle sidebar"
          onClick={toggleSidebar}
        >
          {sidebar ? <PanelLeftClose size={17} /> : <PanelLeftOpen size={17} />}
        </button>
        <button
          className="icon"
          aria-label="Find a note (Ctrl+P)"
          title="Find a note"
          onClick={search}
        >
          <Search size={17} />
        </button>
      </div>
      <div
        className="tab-strip"
        role="tablist"
        aria-label="Open notes"
        data-tauri-drag-region
      >
        {tabs.map((tab) => (
          <div
            className={`note-tab ${tab.id === active ? "active" : ""}`}
            key={tab.id}
          >
            <button
              role="tab"
              aria-selected={tab.id === active}
              aria-controls="editor-workspace"
              tabIndex={tab.id === active ? 0 : -1}
              title={tab.path ?? "New tab"}
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
              <span>{tab.path ? stem(tab.path) : "New tab"}</span>
            </button>
            <button
              className="tab-close"
              aria-label={`Close tab ${tab.path ? stem(tab.path) : "New tab"}`}
              onClick={() => closeTab(tab.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
      <button
        className="icon new-tab"
        aria-label="New tab"
        title="New tab — choose a note, no file created"
        onClick={newTab}
      >
        <Plus size={17} />
      </button>
      <div className="title-drag-space" data-tauri-drag-region />
      <span
        className={`save-state ${status === "Saved" ? "saved" : ""}`}
        role="status"
        data-tauri-drag-region
      >
        {status === "Saved" && <Check size={12} />}
        {status}
      </span>
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
