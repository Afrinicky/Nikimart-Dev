"use client";

import { ShareMenu } from "@/components/share/ShareMenu";

/**
 * Share a product or store. Thin wrapper kept for the existing call sites —
 * the sheet itself (WhatsApp, Facebook, Instagram, TikTok, X, Telegram, email,
 * copy link, and the native share sheet) lives in ShareMenu.
 */
export function ShareButton({
  path,
  title,
  label = "Share",
  tone = "light",
}: {
  path: string;
  title: string;
  label?: string;
  tone?: "light" | "dark";
}) {
  return <ShareMenu path={path} title={title} label={label} tone={tone} />;
}
