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

// `new Webview` starts native creation but does not wait for it. Keep a single
// pending creation per tab so React re-renders (including Strict Mode's effect
// replay) cannot issue commands to a child before Windows has registered it.
const pendingBrowserViews = new Map<string, Promise<Webview>>();
const browserHosts = new Map<string, symbol>();

async function browserWebview(
  appWindow: ReturnType<typeof getCurrentWindow>,
  label: string,
  id: number,
  url: string,
) {
  const existing = await Webview.getByLabel(label);
  if (existing) return existing;

  const pending = pendingBrowserViews.get(label);
  if (pending) return pending;

  const child = new Webview(appWindow, label, {
    url,
    // The constructor accepts logical coordinates only. It is placed with
    // physical coordinates after the native view has finished creating.
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    dataDirectory: `browser/${id}`,
    zoomHotkeysEnabled: true,
  });
  const ready = new Promise<Webview>((resolve, reject) => {
    void child.once("tauri://created", () => resolve(child));
    void child.once("tauri://error", (event) =>
      reject(event.payload ?? "Windows could not create the browser view."),
    );
  });
  pendingBrowserViews.set(label, ready);
  try {
    return await ready;
  } finally {
    pendingBrowserViews.delete(label);
  }
}

// This lifecycle helper deliberately lives beside the component so close-all can
// release native child views even after their React host has unmounted.
// eslint-disable-next-line react-refresh/only-export-components
export const closeBrowserSession = async (id: number) => {
  const label = browserLabel(id);
  const view =
    (await Webview.getByLabel(label)) ?? (await pendingBrowserViews.get(label));
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
  const url = useRef(browser.url);
  const place = useRef<(nextUrl?: string) => Promise<Webview | null>>(
    async () => null,
  );

  useEffect(() => setAddress(browser.url), [browser.url]);
  useEffect(() => {
    url.current = browser.url;
    if (browser.url) void place.current();
  }, [browser.url]);
  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let lastBounds = "";
    const appWindow = getCurrentWindow();
    const owner = Symbol(label);
    browserHosts.set(label, owner);
    const placeView = async (nextUrl = url.current) => {
      const rect = host.current?.getBoundingClientRect();
      if (!rect || rect.width < 2 || rect.height < 2 || disposed || !nextUrl)
        return null;
      try {
        const scale = await appWindow.scaleFactor();
        if (disposed) return null;
        // DOM bounds are relative to Lotus's main webview, but Tauri's native
        // child-webview positions are desktop-relative.  Use the main
        // webview's client origin rather than the outer-window origin so the
        // child starts exactly at the browser host and cannot cover the
        // sidebar or the tab strip.
        const parentPosition = await Webview.getCurrent().position();
        const position = new PhysicalPosition(
          parentPosition.x + Math.round(rect.left * scale),
          parentPosition.y + Math.round(rect.top * scale),
        );
        const size = new PhysicalSize(
          Math.max(1, Math.round(rect.width * scale)),
          Math.max(1, Math.round(rect.height * scale)),
        );
        const bounds = `${position.x},${position.y},${size.width},${size.height}`;
        let child = view.current ?? (await Webview.getByLabel(label));
        if (!child) {
          child = await browserWebview(appWindow, label, browser.id, nextUrl);
        }
        if (disposed) {
          await child.hide().catch(() => {});
          return null;
        }
        view.current = child;
        if (bounds !== lastBounds) {
          // New native child views briefly start at their construction bounds.
          // Hide only while changing bounds; URL updates do not tear this view
          // down, so an old effect cannot hide a newly navigated browser.
          await child.hide().catch(() => {});
          await child.setPosition(position);
          await child.setSize(size);
          lastBounds = bounds;
        }
        if (disposed) {
          await child.hide().catch(() => {});
          return null;
        }
        await child.show();
        if (disposed) await child.hide().catch(() => {});
        return child;
      } catch (error) {
        if (!disposed)
          onError(`Could not open the browser tab: ${String(error)}`);
        return null;
      }
    };
    place.current = placeView;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => void placeView());
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    if (host.current) observer.observe(host.current);
    const main = host.current?.closest("main");
    if (main) observer.observe(main);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    if (url.current) schedule();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      // A child view is shared while it moves between panes. Only its last
      // mounted host may hide it, preventing an old host's async cleanup from
      // blanking the newly visible browser.
      void Promise.resolve(view.current ?? Webview.getByLabel(label))
        .then((child) => {
          if (browserHosts.get(label) === owner) return child?.hide();
          return undefined;
        })
        .catch(() => {});
      view.current = null;
    };
  }, [browser.id, label, onError]);

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
    const open = async () => {
      const child = await place.current(url);
      if (!child) throw new Error("The browser view is not ready.");
      return child;
    };
    if (!browser.url) {
      void open()
        .then(() => {
          setAddress(url);
          onAddress(url);
        })
        .catch((error) => onError(String(error)));
      return;
    }
    void open()
      .then(() => api.browserNavigate(label, url))
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
