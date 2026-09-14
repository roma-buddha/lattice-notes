import { useEffect, useRef, useState } from "react";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronLeft, ChevronRight, Globe2, RotateCw } from "lucide-react";
import { api } from "./notus";
import {
  browserAddress,
  browserLabel,
  type BrowserSession,
} from "./browserSession";

// This lifecycle helper deliberately lives beside the component so close-all can
// release native child views even after their React host has unmounted.
// eslint-disable-next-line react-refresh/only-export-components
export const closeBrowserSession = async (id: number) => {
  const view = await Webview.getByLabel(browserLabel(id));
  await view?.close();
};

// A browser tab remains open when it is not selected, but its native child
// surface must never cover the note that replaced it.
// eslint-disable-next-line react-refresh/only-export-components
export const hideBrowserSession = async (id: number) => {
  const view = await Webview.getByLabel(browserLabel(id));
  await view?.hide();
};

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
    let lastBounds = "";
    const appWindow = getCurrentWindow();
    const place = async () => {
      const rect = host.current?.getBoundingClientRect();
      if (
        !rect ||
        rect.width < 2 ||
        rect.height < 2 ||
        disposed ||
        !browser.url
      )
        return;
      try {
        const scale = await appWindow.scaleFactor();
        if (disposed) return;
        const position = new PhysicalPosition(
          Math.round(rect.left * scale),
          Math.round(rect.top * scale),
        );
        const size = new PhysicalSize(
          Math.max(1, Math.round(rect.width * scale)),
          Math.max(1, Math.round(rect.height * scale)),
        );
        const bounds = `${position.x},${position.y},${size.width},${size.height}`;
        let child = view.current ?? (await Webview.getByLabel(label));
        if (!child) {
          // The constructor accepts logical coordinates only. Create it offscreen
          // and immediately place it with physical coordinates below.
          child = new Webview(appWindow, label, {
            url: browser.url,
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            dataDirectory: `browser/${browser.id}`,
            zoomHotkeysEnabled: true,
          });
        }
        if (disposed) {
          await child.hide().catch(() => {});
          return;
        }
        view.current = child;
        if (bounds !== lastBounds) {
          // Windows native child webviews are not clipped by DOM elements. Hide
          // before moving so their always-on-top surface never crosses Lotus UI.
          await child.hide();
          await child.setPosition(position);
          await child.setSize(size);
          lastBounds = bounds;
        }
        if (disposed) {
          await child.hide().catch(() => {});
          return;
        }
        await child.show();
        if (disposed) await child.hide().catch(() => {});
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
    const main = host.current?.closest("main");
    if (main) observer.observe(main);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      // A create request may still be in flight, so look up the native view as
      // well as the local ref. `place` also hides a child that arrives late.
      void Promise.resolve(view.current ?? Webview.getByLabel(label))
        .then((child) => child?.hide())
        .catch(() => {});
      view.current = null;
    };
  }, [browser.id, browser.url, label, onError]);

  const refreshAddress = () =>
    browser.url &&
    void api
      .browserUrl(label)
      .then((url) => {
        setAddress(url);
        onAddress(url);
      })
      .catch(() => {});
  const navigate = () => {
    const url = browserAddress(address);
    if (!url) return;
    if (!browser.url) {
      setAddress(url);
      onAddress(url);
      return;
    }
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
