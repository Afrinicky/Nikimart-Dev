"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, IdCard, UserRound } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { cn } from "@/lib/cn";

/**
 * Who is signed in, and the two things you do about it.
 *
 * The name and the initial in the corner were a label: the one place in the
 * console that looked like a control and wasn't. Signing out meant scrolling
 * the sidebar to the bottom, and there was no way at all to reach your own
 * account details from in here.
 *
 * It opens rather than navigates, because both destinations are one click
 * further and a menu of two is still faster than guessing which of them the
 * corner would have taken you to.
 */
export function AdminUserMenu({
  name,
  email,
  userId,
}: {
  name: string;
  email: string;
  /** Their own row in Users, where the details are actually edited. */
  userId: string;
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

  return (
    <div ref={wrap} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Your account"
        className={cn(
          "niki-focus flex items-center gap-2.5 rounded-xl py-1 pl-2 pr-1.5 transition-colors",
          open ? "bg-niki-black/5" : "hover:bg-niki-black/5",
        )}
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-semibold leading-tight text-niki-ink">{name}</span>
          <span className="block text-[11px] leading-tight text-niki-ink/45">Administrator</span>
        </span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-black text-sm font-bold text-niki-orange">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-niki-ink/40 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div
          role="menu"
          className="animate-fade-up absolute right-0 top-[calc(100%+0.5rem)] z-40 w-[min(16rem,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-niki-edge"
        >
          <div className="border-b border-niki-edge px-4 py-3">
            <p className="truncate text-sm font-bold text-niki-ink">{name}</p>
            {email ? <p className="truncate text-xs text-niki-ink/50">{email}</p> : null}
          </div>

          <div className="p-1.5">
            <ActionLink
              href="/account"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="niki-focus flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-niki-ink/75 transition-colors hover:bg-niki-surface hover:text-niki-ink"
            >
              <UserRound className="h-4 w-4 shrink-0 text-niki-ink/45" />
              My account
            </ActionLink>
            <ActionLink
              href={`/admin/users/${userId}`}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="niki-focus flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium text-niki-ink/75 transition-colors hover:bg-niki-surface hover:text-niki-ink"
            >
              <IdCard className="h-4 w-4 shrink-0 text-niki-ink/45" />
              Account details
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
