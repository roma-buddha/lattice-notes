import { useEffect, useRef, useState } from "react";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronLeft, ChevronRight, Globe2, RotateCw } from "lucide-react";
import { api } from "./notus";
import { browserLabel, type BrowserSession } from "./browserSession";

// This lifecycle helper deliberately lives beside the component so close-all can
// release native child views even after their React host has unmounted.
// eslint-disable-next-line react-refresh/only-export-components
export const closeBrowserSession = async (id: number) => {
  const view = await Webview.getByLabel(browserLabel(id));
  await view?.close();
};

function webAddress(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function BrowserPane({
  browser,
  onAddress,
  onError,
}: {
  browser: BrowserSession;
  onAddress: (url: string) => void;
  onError: (message: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<Webview | null>(null);
  const [address, setAddress] = useState(browser.url);
  const label = browserLabel(browser.id);

  useEffect(() => setAddress(browser.url), [browser.url]);
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const place = async () => {
      const rect = host.current?.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2 || disposed) return;
      try {
        let child = view.current ?? (await Webview.getByLabel(label));
        if (!child) {
          child = new Webview(getCurrentWindow(), label, {
            url: browser.url,
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.max(1, Math.round(rect.width)),
            height: Math.max(1, Math.round(rect.height)),
            dataDirectory: `browser/${browser.id}`,
            zoomHotkeysEnabled: true,
          });
        }
        if (disposed) return;
        view.current = child;
        await child.setPosition(
          new LogicalPosition(Math.round(rect.left), Math.round(rect.top)),
        );
        await child.setSize(
          new LogicalSize(
            Math.max(1, Math.round(rect.width)),
            Math.max(1, Math.round(rect.height)),
          ),
        );
        await child.show();
      } catch (error) {
        if (!disposed)
          onError(`Could not open the browser tab: ${String(error)}`);
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void place());
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    if (host.current) observer.observe(host.current);
    window.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      void view.current?.hide().catch(() => {});
      view.current = null;
    };
  }, [browser.id, browser.url, label, onError]);

  const refreshAddress = () =>
    void api
      .browserUrl(label)
      .then((url) => {
        setAddress(url);
        onAddress(url);
      })
      .catch(() => {});
  const navigate = () => {
    const url = webAddress(address);
    if (!url) return;
    void api
      .browserNavigate(label, url)
      .then((next) => {
        setAddress(next);
        onAddress(next);
        window.setTimeout(refreshAddress, 250);
      })
      .catch((error) => onError(String(error)));
  };
  const action = (task: Promise<void>) =>
    void task
      .then(() => window.setTimeout(refreshAddress, 200))
      .catch((error) => onError(String(error)));
  return (
    <section className="browser-pane" aria-label="Browser">
      <div className="browser-toolbar">
        <button
          type="button"
          className="icon"
          title="Back"
          aria-label="Back"
          onClick={() => action(api.browserHistory(label, false))}
        >
          <ChevronLeft size={17} />
        </button>
        <button
          type="button"
          className="icon"
          title="Forward"
          aria-label="Forward"
          onClick={() => action(api.browserHistory(label, true))}
        >
          <ChevronRight size={17} />
        </button>
        <button
          type="button"
          className="icon"
          title="Reload"
          aria-label="Reload"
          onClick={() => action(api.browserReload(label))}
        >
          <RotateCw size={15} />
        </button>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            navigate();
          }}
        >
          <Globe2 size={15} aria-hidden="true" />
          <input
            aria-label="Web address"
            value={address}
            spellCheck={false}
            onChange={(event) => setAddress(event.target.value)}
            onBlur={refreshAddress}
          />
        </form>
      </div>
      <div
        ref={host}
        className="browser-surface"
        onPointerDown={() => void view.current?.setFocus().catch(() => {})}
      />
    </section>
  );
}
