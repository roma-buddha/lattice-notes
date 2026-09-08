import { useLayoutEffect, useRef } from "react";
import { type Anchor } from "./sidebarTypes";
export function AnchoredPanel({
  anchor,
  label,
  menu = false,
  children,
  onClose,
}: {
  anchor: Anchor;
  label: string;
  menu?: boolean;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const element = ref.current!;
    const position = () => {
      const rect = element.getBoundingClientRect();
      element.style.left = `${Math.max(8, Math.min(anchor.x, innerWidth - rect.width - 8))}px`;
      element.style.top = `${Math.max(48, Math.min(anchor.y, innerHeight - rect.height - 8))}px`;
    };
    position();
    element.querySelector<HTMLElement>("button, input")?.focus();
    const outside = (event: PointerEvent) => {
      if (
        !element.contains(event.target as Node) &&
        !anchor.trigger.contains(event.target as Node)
      )
        close.current();
    };
    const resize = new ResizeObserver(position);
    resize.observe(element);
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", position);
    return () => {
      resize.disconnect();
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", position);
      // Do not steal focus from a new inline input or the user's outside click.
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) anchor.trigger.focus();
      });
    };
  }, [anchor]);
  return (
    <div
      ref={ref}
      className={`anchored-panel ${menu ? "context-menu" : "vault-settings"}`}
      role={menu ? "menu" : "dialog"}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          anchor.trigger.focus();
          return;
        }
        const items = [
          ...ref.current!.querySelectorAll<HTMLElement>(
            "button:not(:disabled), input:not(:disabled)",
          ),
        ];
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
            anchor.trigger.focus();
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
    </div>
  );
}
