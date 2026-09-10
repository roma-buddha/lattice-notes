import { useLayoutEffect, useRef, useState } from "react";
import {
  Bookmark,
  Check,
  CircleAlert,
  Clock,
  Lock,
  LockOpen,
  Sparkles,
  Undo2,
  Type,
  X,
} from "lucide-react";
import { stem, parentOf, type Document } from "./notus";
import { anchorBelow, type Anchor } from "./sidebarTypes";

/** Both panes use the same header; each action is bound to this document. */
export function NoteHeader({
  note,
  status,
  bookmarked,
  bookmark,
  lock,
  appearance,
  undo,
  canUndo,
  drop,
  rename,
  close,
  ai,
}: {
  note: Document;
  status: string;
  bookmarked: boolean;
  bookmark: () => void;
  lock: () => void;
  appearance: (anchor: Anchor) => void;
  undo: () => void;
  canUndo: boolean;
  drop: (path: string) => void;
  rename: (name: string) => Promise<void>;
  close?: () => void;
  ai: () => void;
}) {
  const [over, setOver] = useState(false);
  const [name, setName] = useState(stem(note.path));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const title = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    setName(stem(note.path));
    setError("");
    setOver(false);
  }, [note.path]);
  useLayoutEffect(() => {
    const el = title.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "0";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        resize();
      }
    });
    let width = el.clientWidth;
    observer.observe(el);
    return () => observer.disconnect();
  }, [name]);
  const commit = async () => {
    if (busy || note.locked || name === stem(note.path)) return;
    setBusy(true);
    setError("");
    try {
      await rename(name.trim());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header
        className={`note-heading ${over ? "pane-drop-target" : ""}`}
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.some((t) =>
              ["notus-note", "application/notus-tab"].includes(t),
            )
          ) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
            setOver(true);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node))
            setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOver(false);
          let path = e.dataTransfer.getData("text/notus-path");
          try {
            path =
              JSON.parse(e.dataTransfer.getData("application/notus-tab"))
                .path || path;
          } catch {
            /* Sidebar transfer. */
          }
          if (path) drop(path);
        }}
      >
        <div className="note-title-group">
          <p className="eyebrow">
            {parentOf(note.path).replaceAll("/", " / ")}
          </p>
          <textarea
            ref={title}
            rows={1}
            className="note-title"
            aria-label="Note title"
            value={name}
            readOnly={note.locked || busy}
            spellCheck={false}
            onChange={(e) => setName(e.target.value.replace(/[\r\n]/g, ""))}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setName(stem(note.path));
                setError("");
              }
            }}
          />
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
        </div>
        <div className="note-actions">
          <button
            className="icon"
            aria-label="Text appearance"
            title="Text appearance"
            onClick={(e) => appearance(anchorBelow(e.currentTarget))}
          >
            <Type size={17} />
          </button>
          <button
            className="icon"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo || note.locked}
            onClick={undo}
          >
            <Undo2 size={16} />
          </button>
          <button
            className="icon"
            aria-label={bookmarked ? "Remove bookmark" : "Bookmark note"}
            title={bookmarked ? "Remove bookmark" : "Bookmark note"}
            aria-pressed={bookmarked}
            onClick={bookmark}
          >
            <Bookmark size={16} fill={bookmarked ? "currentColor" : "none"} />
          </button>
          <button
            className="icon lock-toggle tip-control"
            aria-label={note.locked ? "Unlock note" : "Lock note"}
            aria-pressed={note.locked}
            data-tooltip={
              note.locked ? "Unlock note to edit" : "Lock note (read only)"
            }
            onClick={lock}
          >
            {note.locked ? <Lock size={15} /> : <LockOpen size={15} />}
          </button>
          <button
            className="icon"
            aria-label="Open AI assistant"
            title="AI assistant"
            onClick={ai}
          >
            <Sparkles size={16} />
          </button>
          <span
            role="status"
            tabIndex={0}
            aria-label={status}
            data-tooltip={status}
            className={`note-save-status tip-control ${status === "Saved" ? "saved" : ""}`}
          >
            {status === "Saved" ? (
              <Check size={17} />
            ) : /failed|conflict/i.test(status) ? (
              <CircleAlert size={17} />
            ) : (
              <Clock size={17} />
            )}
          </span>
          {close && (
            <button
              className="icon"
              aria-label="Close pane"
              title="Close pane"
              onClick={close}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </header>
    </>
  );
}
