"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  bubbleSize,
  clampOffset,
  defaultOffset,
  panelSide,
} from "@/lib/chat/bubble-position";
import { offsetStore, viewport } from "@/components/chat/bubble-store";
import { cn } from "@/lib/cn";

/**
 * A bubble that floats over the page, and the panel it opens.
 *
 * Movable, because no fixed corner is right on every screen: it was sitting on
 * top of the Account tab on a phone and over the send button in the console,
 * and a bubble that covers the thing you were reaching for is worse than no
 * bubble. Where somebody puts it is remembered per browser.
 *
 * Dragging is by pointer events rather than mouse and touch separately, and a
 * drag only counts once the finger has actually travelled — otherwise every
 * tap would be a tiny drag and the bubble would never open.
 */

const MOVE_THRESHOLD = 6;

export function FloatingBubble({
  storageKey,
  hasBottomNav = false,
  label,
  badge,
  tone = "orange",
  icon,
  panel,
  open,
  onOpenChange,
}: {
  /** Where this bubble's position is remembered. One per bubble. */
  storageKey: string;
  /** True on the shop, where a bottom navigation bar owns the lower edge. */
  hasBottomNav?: boolean;
  label: string;
  badge?: number;
  tone?: "orange" | "black";
  icon: React.ReactNode;
  panel: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const store = useMemo(() => offsetStore(storageKey), [storageKey]);
  const stored = useSyncExternalStore(store.subscribe, store.get, store.server);
  const screen = useSyncExternalStore(viewport.subscribe, viewport.get, viewport.server);

  const [dragging, setDragging] = useState(false);
  const moved = useRef(false);
  const start = useRef<{ x: number; y: number; right: number; bottom: number } | null>(null);

  // Derived rather than measured in an effect: the position is a function of
  // the screen and what has been stored, so it is right on the first render
  // instead of jumping from one corner to another on the second.
  const size = bubbleSize(screen.width);
  const offset = clampOffset(
    stored ?? defaultOffset(screen.width, hasBottomNav),
    screen,
    size,
  );

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    moved.current = false;
    start.current = { x: e.clientX, y: e.clientY, right: offset.right, bottom: offset.bottom };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const from = start.current;
    if (!from) return;
    const dx = from.x - e.clientX;
    const dy = from.y - e.clientY;
    if (!moved.current && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
    moved.current = true;
    setDragging(true);
    store.move(
      clampOffset({ right: from.right + dx, bottom: from.bottom + dy }, screen, size),
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const wasDrag = moved.current;
    start.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (wasDrag) {
      store.persist(offset);
      return;
    }
    onOpenChange(!open);
  }

  const side = panelSide(offset, screen.width);
  const panelGap = size + 12;

  return (
    <>
      {open ? (
        <div
          className="animate-fade-up fixed z-[80] flex flex-col overflow-hidden rounded-3xl bg-niki-surface shadow-2xl ring-1 ring-niki-edge"
          style={{
            bottom: offset.bottom + panelGap,
            [side]: Math.max(8, side === "right" ? offset.right : 8),
            width: "min(23rem, calc(100vw - 1.5rem))",
            height: `min(30rem, calc(100dvh - ${offset.bottom + panelGap + 24}px))`,
          }}
        >
          {panel}
        </div>
      ) : null}

      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        aria-expanded={open}
        aria-label={label}
        title={`${label} — drag to move`}
        className={cn(
          "niki-focus fixed z-[80] flex touch-none select-none items-center justify-center rounded-full text-white shadow-lg",
          tone === "orange" ? "bg-niki-orange" : "bg-niki-black",
          dragging ? "scale-105 cursor-grabbing" : "cursor-grab transition-transform active:scale-95",
        )}
        style={{ right: offset.right, bottom: offset.bottom, width: size, height: size }}
      >
        {icon}
        {badge && badge > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-niki-black px-1 font-figures text-[11px] font-bold text-white ring-2 ring-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>
    </>
  );
}
