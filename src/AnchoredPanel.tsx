import { createPortal } from "react-dom";
import { useLayoutEffect, useRef } from "react";
import { type Anchor } from "./sidebarTypes";
export function AnchoredPanel({
  anchor,
  label,
  menu = false,
  children,
  onClose,
  className = "",
}: {
  anchor: Anchor;
  label: string;
  menu?: boolean;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = ref.current!;
    const peer = anchor.beside;
    const peerWidth = peer?.style.width ?? "";
    const peerLeft = peer?.style.left ?? "";
    const peerTop = peer?.style.top ?? "";
    const peerMaxHeight = peer?.style.maxHeight ?? "";
    const position = () => {
      const rect = element.getBoundingClientRect();
      if (anchor.beside?.isConnected) {
        const peer = anchor.beside;
        const boundary =
          document.querySelector(".sidebar")?.getBoundingClientRect().right ??
          anchor.x;
        const available = innerWidth - boundary - 16;
        const stacked = available < 520;
        const left = Math.max(8, boundary);
        peer.style.width = `${Math.max(180, Math.min(460, stacked ? available : available * 0.53))}px`;
        peer.style.left = `${left}px`;
        element.style.width = `${Math.max(180, Math.min(330, stacked ? available : available - peer.getBoundingClientRect().width - 8))}px`;
        const p = peer.getBoundingClientRect();
        element.style.left = `${stacked ? left : p.right + 8}px`;
        if (stacked) {
          peer.style.maxHeight = `${Math.max(140, (innerHeight - 80) * 0.44)}px`;
          peer.style.top = "48px";
          element.style.maxHeight = `${Math.max(160, innerHeight - peer.getBoundingClientRect().bottom - 16)}px`;
          element.style.top = `${peer.getBoundingClientRect().bottom + 8}px`;
        } else
          element.style.top = `${Math.max(48, Math.min(p.top, innerHeight - element.getBoundingClientRect().height - 8))}px`;
        return;
      }
      if (className.includes("vault-picker-popup")) {
        const edge =
          document.querySelector(".sidebar")?.getBoundingClientRect().right ??
          anchor.x;
        element.style.width = `${Math.max(180, Math.min(460, innerWidth - edge - 8))}px`;
        element.style.left = `${edge}px`;
      } else
        element.style.left = `${Math.max(8, Math.min(anchor.x, innerWidth - rect.width - 8))}px`;
      element.style.top = `${Math.max(48, Math.min(anchor.y, innerHeight - rect.height - 8))}px`;
    };
    position();
    element
      .querySelector<HTMLElement>("button, input")
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        !element.contains(event.target as Node) &&
        !(
          anchor.trigger.matches("button") &&
          anchor.trigger.contains(event.target as Node)
        ) &&
        !(
          className.includes("vault-picker-popup") &&
          (event.target as HTMLElement).closest('[aria-label="Vault settings"]')
        )
      )
        close.current();
    };
    const resize = new ResizeObserver(position);
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !element.contains(document.activeElement)) {
        event.preventDefault();
        close.current();
        anchor.trigger.focus({ preventScroll: true });
      }
    };
    resize.observe(element);
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", position);
    return () => {
      resize.disconnect();
      if (peer?.isConnected) {
        peer.style.width = peerWidth;
        peer.style.left = peerLeft;
        peer.style.top = peerTop;
        peer.style.maxHeight = peerMaxHeight;
      }
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", position);
      // Do not steal focus from a new inline input or the user's outside click.
      requestAnimationFrame(() => {
        if (document.activeElement === document.body)
          anchor.trigger.focus({ preventScroll: true });
      });
    };
  }, [anchor, className]);
  return createPortal(
    <div
      ref={ref}
      className={`anchored-panel ${menu ? "context-menu" : "vault-settings"} ${className}`}
      role={menu ? "menu" : "dialog"}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          anchor.trigger.focus({ preventScroll: true });
          return;
        }
        const items = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
          ),
        ].filter(
          (item) =>
            item.getClientRects().length > 0 &&
            (!menu || !item.closest(".submenu")),
        );
        const index = items.indexOf(document.activeElement as HTMLElement);
        const direction =
          event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (
          menu &&
          (direction || event.key === "Home" || event.key === "End")
        ) {
          event.preventDefault();
          items[
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index + direction + items.length) % items.length
          ]?.focus();
        }
        if (event.key === "Tab") {
          if (menu) {
            event.preventDefault();
            onClose();
            anchor.trigger.focus({ preventScroll: true });
          } else if (
            (event.shiftKey && index === 0) ||
            (!event.shiftKey && index === items.length - 1)
          ) {
            event.preventDefault();
            items[event.shiftKey ? items.length - 1 : 0]?.focus();
          }
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
