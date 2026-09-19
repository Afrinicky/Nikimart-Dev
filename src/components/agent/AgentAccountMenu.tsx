"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Settings2, UserRound } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/cn";

/**
 * The store's name in the sidebar, and the two things you do about it.
 *
 * It was a label — the one part of the sidebar that looked like a control and
 * was not. Signing out meant scrolling past every screen in the console to the
 * bottom of the list, and there was nothing at all here that led to the account
 * behind the store.
 *
 * Collapsed, the mark alone is the button; the menu is the only way to read the
 * store's name at that width, which is a reason to open it rather than a
 * shortcoming.
 */
export function AgentAccountMenu({
  name,
  code,
  collapsed,
}: {
  name: string;
  code: string;
  collapsed: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "niki-focus flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-niki-ink/75 transition-colors hover:bg-niki-surface hover:text-niki-ink";

  return (
    <div ref={wrap} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Your account"
        className={cn(
          "niki-focus flex w-full items-center gap-2.5 rounded-xl p-1 text-left transition-colors hover:bg-white/10",
          open && "bg-white/10",
          collapsed && "justify-center",
        )}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-niki-orange">
          <BrandLogo className="h-5 w-auto" />
        </span>
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-sm font-bold leading-tight text-white">
                {name}
              </span>
              <span className="block truncate font-mono text-[11px] leading-tight text-white/45">
                {code}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 text-white/40 transition-transform",
                open && "rotate-180",
              )}
            />
          </>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[15rem] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-niki-edge"
        >
          <div className="border-b border-niki-edge px-4 py-3">
            <p className="truncate text-sm font-bold text-niki-ink">{name}</p>
            <p className="truncate font-mono text-xs text-niki-ink/50">{code}</p>
          </div>

          <div className="p-1.5">
            <ActionLink href="/account" role="menuitem" onClick={() => setOpen(false)} className={item}>
              <UserRound className="h-4 w-4 shrink-0 text-niki-ink/45" />
              My account
            </ActionLink>
            <ActionLink
              href="/agent/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={item}
            >
              <Settings2 className="h-4 w-4 shrink-0 text-niki-ink/45" />
              Settings
            </ActionLink>
          </div>

          <div className="border-t border-niki-edge p-1.5">
            <LogoutButton
              label="Log out"
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-semibold text-niki-danger transition-colors hover:bg-niki-danger/10"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
