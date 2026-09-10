import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, Square, Settings2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ai,
  connectionName,
  type Connection,
  type Message,
  type NoteContext,
  type Provider,
} from "./ai";
import { api, stem } from "./notus";
type Proposal = { note: NoteContext; replacement: string };
export function AIChat({
  open,
  close,
  settings,
  capture,
  apply,
  noteName,
}: {
  open: boolean;
  close: () => void;
  settings: () => void;
  noteName: string;
  capture: () => NoteContext | null;
  apply: (note: NoteContext, replacement: string) => Promise<void>;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [provider, setProvider] = useState<Provider>("openrouter");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [context, setContext] = useState<"none" | "note" | "selection">("none");
  const [mode, setMode] = useState<"chat" | "edit">("chat");
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [width, setWidth] = useState(380);
  const [status, setStatus] = useState("");
  const generation = useRef(0);
  const conversation = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const requestGeneration = generation;
    const load = () => {
      void ai
        .connections()
        .then((list) => {
          setConnections(list);
          setProvider((p) =>
            list.some((c) => c.provider === p)
              ? p
              : (list[0]?.provider ?? "openrouter"),
          );
        })
        .catch((e) => setError(String(e)));
    };
    const reload = () => {
      requestGeneration.current++;
      void ai.stop().catch(() => {});
      setMessages([]);
      setProposal(null);
      load();
    };
    load();
    window.addEventListener("lotus-ai-settings", reload);
    return () => {
      requestGeneration.current++;
      void ai.stop().catch(() => {});
      window.removeEventListener("lotus-ai-settings", reload);
    };
  }, []);
  useEffect(() => {
    if (open) composer.current?.focus({ preventScroll: true });
  }, [open]);
  useEffect(() => {
    conversation.current?.scrollTo({ top: conversation.current.scrollHeight });
  }, [messages, proposal, busy]);
  const stop = () => {
    generation.current++;
    void ai.stop().catch((e) => setError(String(e)));
    setStatus("Stopping…");
  };
  const send = async () => {
    if (!input.trim() || busy || applying || !connections.length)
      return;
    setError("");
    setStatus("");
    const selected = capture();
    let attached: NoteContext | null = null;
    if (context !== "none") {
      if (!selected) {
        setError("Open a note first.");
        return;
      }
      attached = {
        ...selected,
        from: context === "note" ? 0 : selected.from,
        to: context === "note" ? selected.body.length : selected.to,
      };
      if (context === "selection" && attached.from === attached.to) {
        setError("Select text in the note first.");
        return;
      }
    }
    if (mode === "edit" && (!attached || attached.locked)) {
      setError("Choose an unlocked note or selection to edit.");
      return;
    }
    const message = input.trim();
    const next: Message[] = [
      ...messages,
      { role: "user", content: message },
    ];
    const id = ++generation.current;
    setBusy(true);
    setProposal(null);
    // Make sending feel like a conversation: the message leaves the composer
    // before the provider starts working, and is retained if the request fails.
    setMessages(next);
    setInput("");
    try {
      const reply = await ai.chat(
        provider,
        next,
        attached ? attached.body.slice(attached.from, attached.to) : null,
        mode === "edit",
      );
      if (id !== generation.current) return;
      setMessages([...next, { role: "assistant", content: reply.text }]);
      if (reply.replacement !== null && attached)
        setProposal({ note: attached, replacement: reply.replacement });
    } catch (e) {
      if (id === generation.current) setError(String(e));
    } finally {
      setBusy(false);
      if (id !== generation.current) setStatus("Stopped. No note was changed.");
    }
  };
  return (
    <aside
      hidden={!open}
      className="ai-chat"
      aria-label="AI assistant"
      style={{ width }}
    >
      <div
        className="ai-resize"
        role="separator"
        aria-label="Resize AI pane"
        aria-orientation="vertical"
        tabIndex={0}
        aria-valuemin={280}
        aria-valuemax={640}
        aria-valuenow={width}
        onKeyDown={(e) => {
          if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
            e.preventDefault();
            setWidth((w) =>
              Math.max(
                280,
                Math.min(640, w + (e.key === "ArrowLeft" ? 20 : -20)),
              ),
            );
          }
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.currentTarget.dataset.x = String(e.clientX);
          e.currentTarget.dataset.width = String(width);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            setWidth(
              Math.max(
                280,
                Math.min(
                  640,
                  Number(e.currentTarget.dataset.width) +
                    Number(e.currentTarget.dataset.x) -
                    e.clientX,
                ),
              ),
            );
        }}
      />
      <header className="ai-chat-header">
        <span>
          <Sparkles size={16} /> Assistant
        </span>
        <button
          className="icon"
          aria-label="Assistant options"
          title="Assistant options"
          aria-expanded={configurationOpen}
          disabled={busy || applying}
          onClick={() => setConfigurationOpen((open) => !open)}
        >
          <Settings2 size={17} />
        </button>
        <button
          className="icon"
          aria-label="Close AI assistant"
          onClick={() => {
            if (busy) stop();
            close();
          }}
        >
          <X size={17} />
        </button>
      </header>
      {configurationOpen && (
        <section className="ai-configuration" aria-label="Assistant options">
          <label>
            Model
            <select
              aria-label="Chat model"
              disabled={busy || applying}
              value={connections.length ? provider : ""}
              onChange={(e) => {
                setProvider(e.target.value as Provider);
                setMessages([]);
                setProposal(null);
                setStatus("New conversation for the selected provider.");
              }}
            >
              {!connections.length && <option value="">No model connected</option>}
              {connections.map((c) => (
                <option key={c.provider} value={c.provider}>
                  {connectionName(c)} · {c.model}
                </option>
              ))}
            </select>
          </label>
          <div className="ai-configuration-row">
            <label>
              Context
              <select value={context} aria-label="Context" disabled={busy} onChange={(e) => setContext(e.target.value as typeof context)}>
                <option value="none">No note</option>
                <option value="note">Current note</option>
                <option value="selection">Selected text</option>
              </select>
            </label>
            <label>
              Mode
              <select value={mode} aria-label="Mode" disabled={busy} onChange={(e) => setMode(e.target.value as typeof mode)}>
                <option value="chat">Chat</option>
                <option value="edit">Suggest edit</option>
              </select>
            </label>
          </div>
          {context !== "none" && <p className="ai-context-name" title={noteName}>{noteName}</p>}
          <button className="ai-manage-models" type="button" onClick={settings}>Manage AI models…</button>
        </section>
      )}
      <div className="ai-conversation" ref={conversation} aria-live="polite">
        {messages.map((m, i) => (
          <article key={i} className={`ai-message ${m.role}`}>
            <small>{m.role === "user" ? "You" : "Assistant"}</small>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                img: () => null,
                a: ({ href, children }) => (
                  <button
                    className="ai-link"
                    onClick={() => {
                      if (href && /^https?:\/\//i.test(href))
                        void api
                          .openExternal(href)
                          .catch((e) => setError(String(e)));
                    }}
                  >
                    {children}
                  </button>
                ),
              }}
            >
              {m.content}
            </ReactMarkdown>
          </article>
        ))}
        {proposal && (
          <section className="ai-proposal">
            <h4>Suggested edit · {stem(proposal.note.path)}</h4>
            <p className="muted">
              Replaces{" "}
              {proposal.note.from === 0 &&
              proposal.note.to === proposal.note.body.length
                ? "the note body"
                : "the selected passage"}
              . Review before applying.
            </p>
            <details>
              <summary>Original text</summary>
              <pre>
                {proposal.note.body.slice(proposal.note.from, proposal.note.to)}
              </pre>
            </details>
            <p>Replacement</p>
            <div className="ai-preview">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  img: () => null,
                  a: ({ children }) => <span>{children}</span>,
                }}
              >
                {proposal.replacement || "(Delete the selected text)"}
              </ReactMarkdown>
            </div>
            <div className="ai-actions">
              <button
                className="primary"
                disabled={applying || busy}
                onClick={() => {
                  setApplying(true);
                  setError("");
                  void apply(proposal.note, proposal.replacement)
                    .then(() => {
                      setProposal(null);
                      setStatus("Edit applied. Use the note’s Undo to revert.");
                    })
                    .catch((e) => setError(String(e)))
                    .finally(() => setApplying(false));
                }}
              >
                Apply
              </button>
              <button disabled={applying} onClick={() => setProposal(null)}>
                Discard
              </button>
            </div>
          </section>
        )}
        {busy && <p role="status">Thinking…</p>}
      </div>
      <div className="ai-composer">
        <textarea
          ref={composer}
          aria-label="Message to AI"
          placeholder="Ask anything…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="ai-send">
          <div className="ai-quick-controls" aria-label="Message options">
            <select aria-label="Message context" value={context} disabled={busy} onChange={(e) => setContext(e.target.value as typeof context)}>
              <option value="none">No note</option>
              <option value="note">Note</option>
              <option value="selection" disabled={!capture()}>Selected text</option>
            </select>
            <select aria-label="Message mode" value={mode} disabled={busy || context === "none"} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="chat">Chat</option>
              <option value="edit">Edit</option>
            </select>
          </div>
          {busy ? (
            <button onClick={stop}>
              <Square size={14} />
              Stop
            </button>
          ) : (
            <button
              className="primary"
              disabled={
                !input.trim() || !connections.length || applying
              }
              onClick={() => void send()}
            >
              <Send size={15} />
              Send
            </button>
          )}
        </div>
        {status && <p role="status">{status}</p>}
        {error && (
          <p role="alert" className="ai-error">
            {error}
          </p>
        )}
      </div>
    </aside>
  );
}
