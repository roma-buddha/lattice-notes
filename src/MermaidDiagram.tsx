import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { ZoomIn, ZoomOut, Maximize2, Code2 } from "lucide-react";
let serial = 0;
let queue: Promise<unknown> = Promise.resolve();
export function MermaidDiagram({
  source,
  onChange,
  preferenceKey,
}: {
  source: string;
  onChange?: (source: string) => void;
  preferenceKey: string;
}) {
  const [svg, setSvg] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(source);
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [theme, setTheme] = useState(document.documentElement.dataset.theme);
  const viewport = useRef<HTMLDivElement>(null);
  const diagram = useRef<HTMLElement>(null);
  const [available, setAvailable] = useState({ width: 1, height: 1 });
  const key = `lotus-diagram:${preferenceKey}`;
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.dataset.theme),
    );
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setError("");
    const render = async () => {
      try {
        if (source.length > 20000)
          throw Error("Diagram exceeds the 20,000-character rendering limit.");
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          suppressErrorRendering: true,
          maxTextSize: 20000,
          maxEdges: 500,
          theme: theme === "dark" ? "dark" : "neutral",
          fontFamily: "Segoe UI, sans-serif",
          htmlLabels: false,
          flowchart: { htmlLabels: false },
          secure: [
            "securityLevel",
            "startOnLoad",
            "maxTextSize",
            "maxEdges",
            "suppressErrorRendering",
          ],
        });
        const { svg: output } = await mermaid.render(
          `lotus-diagram-${++serial}`,
          source,
        );
        const clean = DOMPurify.sanitize(output, {
          USE_PROFILES: { svg: true, svgFilters: true },
          FORBID_TAGS: ["foreignObject", "image", "a", "script"],
        });
        const doc = new DOMParser().parseFromString(clean, "image/svg+xml"),
          box = doc.documentElement
            .getAttribute("viewBox")
            ?.split(/[ ,]+/)
            .map(Number);
        if (active) {
          setSvg(clean);
          setSize({ width: box?.[2] || 800, height: box?.[3] || 400 });
        }
      } catch (e) {
        if (active) {
          setSvg("");
          setError(String(e));
        }
      }
    };
    queue = queue.then(render, render);
    return () => {
      active = false;
    };
  }, [source, theme]);
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    try {
      const p = JSON.parse(localStorage.getItem(key) || "{}");
      if (p.height)
        el.style.height = `${Math.max(160, Math.min(900, p.height))}px`;
      if (p.zoom) setZoom(Math.max(0.2, Math.min(4, p.zoom)));
    } catch {
      /* Default fit. */
    }
    const observer = new ResizeObserver(() => {
      setAvailable({
        width: el.clientWidth - 20,
        height: el.clientHeight - 20,
      });
      try {
        const p = JSON.parse(localStorage.getItem(key) || "{}");
        localStorage.setItem(
          key,
          JSON.stringify({ ...p, height: el.clientHeight }),
        );
      } catch {
        /* Optional display preference. */
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [key, editing]);
  const changeZoom = (value: number) => {
    setZoom(value);
    try {
      const p = JSON.parse(localStorage.getItem(key) || "{}");
      localStorage.setItem(key, JSON.stringify({ ...p, zoom: value }));
    } catch {
      /* Optional display preference. */
    }
  };
  const scale =
    Math.min(available.width / size.width, available.height / size.height, 1) *
    zoom;
  return (
    <section ref={diagram} className="mermaid-diagram" aria-label="Mermaid diagram">
      <div className="diagram-toolbar">
        <button
          className="icon"
          title="Zoom out"
          aria-label="Zoom out diagram"
          onClick={() => changeZoom(Math.max(0.2, zoom * 0.8))}
        >
          <ZoomOut size={15} />
        </button>
        <button
          className="icon"
          title="Zoom in"
          aria-label="Zoom in diagram"
          onClick={() => changeZoom(Math.min(4, zoom * 1.25))}
        >
          <ZoomIn size={15} />
        </button>
        <button
          className="icon"
          title="Expand diagram"
          aria-label="Expand diagram"
          onClick={() => void diagram.current?.requestFullscreen?.()}
        >
          <Maximize2 size={15} />
        </button>
        {onChange && (
          <button
            title="Edit diagram"
            onClick={() => {
              setDraft(source);
              setEditing(!editing);
            }}
          >
            <Code2 size={15} />
            Edit diagram
          </button>
        )}
      </div>
      {editing ? (
        <div className="diagram-source">
          <textarea
            aria-label="Mermaid source"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div>
            <button onClick={() => setEditing(false)}>Cancel</button>
            <button
              className="primary"
              onClick={() => {
                onChange?.(draft);
                setEditing(false);
              }}
            >
              Save diagram
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={viewport}
          className="diagram-viewport"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget,
              start = {
                x: e.clientX,
                y: e.clientY,
                left: el.scrollLeft,
                top: el.scrollTop,
              };
            // Leave the native bottom-right resize handle to the browser.
            const rect = el.getBoundingClientRect();
            if (e.clientX > rect.right - 20 && e.clientY > rect.bottom - 20)
              return;
            el.setPointerCapture(e.pointerId);
            const move = (p: PointerEvent) => {
              el.scrollLeft = start.left + start.x - p.clientX;
              el.scrollTop = start.top + start.y - p.clientY;
            };
            const stop = () => {
              el.removeEventListener("pointermove", move);
              el.removeEventListener("pointerup", stop);
              el.removeEventListener("pointercancel", stop);
            };
            el.addEventListener("pointermove", move);
            el.addEventListener("pointerup", stop);
            el.addEventListener("pointercancel", stop);
          }}
        >
          {error ? (
            <p role="alert" className="diagram-error">
              Could not render this diagram. {error}
            </p>
          ) : svg ? (
            <div
              className="diagram-svg"
              style={{ width: size.width * scale, height: size.height * scale }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <p role="status">Rendering diagram…</p>
          )}
        </div>
      )}
    </section>
  );
}
