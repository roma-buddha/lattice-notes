import { useLayoutEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { AnchoredPanel } from "./AnchoredPanel";
import type { Anchor } from "./sidebarTypes";
export type MenuItem = {
  label: string;
  run?: () => void;
  disabled?: boolean;
  children?: MenuItem[];
  separator?: boolean;
};
function Items({ items, close }: { items: MenuItem[]; close: () => void }) {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <>
      {items.map((item) => (
        <div
          className={
            item.separator ? "menu-branch menu-separated" : "menu-branch"
          }
          key={item.label}
          onMouseEnter={() =>
            setOpened(!item.disabled && item.children ? item.label : null)
          }
        >
          <button
            role="menuitem"
            disabled={item.disabled}
            aria-haspopup={item.children ? "menu" : undefined}
            aria-expanded={item.children ? opened === item.label : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" && item.children) {
                e.preventDefault();
                e.stopPropagation();
                const parent = e.currentTarget.parentElement;
                setOpened(item.label);
                requestAnimationFrame(() =>
                  parent
                    ?.querySelector<HTMLElement>(".submenu button")
                    ?.focus(),
                );
              }
            }}
            onClick={() => {
              if (item.children) setOpened(item.label);
              else {
                close();
                item.run?.();
              }
            }}
          >
            <span>{item.label}</span>
            {item.children && <ChevronRight size={13} />}
          </button>
          {item.children && opened === item.label && (
            <Submenu
              items={item.children}
              close={close}
              back={() => setOpened(null)}
            />
          )}
        </div>
      ))}
    </>
  );
}
function Submenu({
  items,
  close,
  back,
}: {
  items: MenuItem[];
  close: () => void;
  back: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const rect = el.parentElement!.getBoundingClientRect();
    const own = el.getBoundingClientRect();
    el.style.left = `${rect.right + own.width > innerWidth - 8 ? Math.max(8, rect.left - own.width) : rect.right}px`;
    el.style.top = `${Math.max(8, Math.min(rect.top, innerHeight - own.height - 8))}px`;
  }, []);
  return (
    <div
      ref={ref}
      role="menu"
      className="submenu"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          e.stopPropagation();
          ref.current?.parentElement?.querySelector("button")?.focus();
          back();
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          e.stopPropagation();
          const buttons = [
            ...ref.current!.querySelectorAll<HTMLButtonElement>(
              ":scope > .menu-branch > button:not(:disabled)",
            ),
          ];
          const i = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          buttons[
            (i + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }
      }}
    >
      <Items items={items} close={close} />
    </div>
  );
}
export function ContextMenu({
  anchor,
  items,
  onClose,
  label = "Note actions",
}: {
  anchor: Anchor;
  items: MenuItem[];
  onClose: () => void;
  label?: string;
}) {
  return (
    <AnchoredPanel anchor={anchor} label={label} menu onClose={onClose}>
      <Items items={items} close={onClose} />
    </AnchoredPanel>
  );
}
