// Pure WhatsApp link helpers (no server-only deps) — usable on client + server.
import { phoneDigits, normalizeGhPhone } from "@/lib/phone";

/** Normalise a number to international digits (no +) for wa.me, or null. */
export function waNumber(raw?: string | null): string | null {
  if (!raw) return null;
  const gh = normalizeGhPhone(raw);
  if (gh) return gh;
  const d = phoneDigits(raw);
  return d.length >= 8 ? d : null;
}

/** A wa.me chat link to a specific number, optionally pre-filling a message. */
export function waChatLink(raw: string | null | undefined, text?: string): string | null {
  const n = waNumber(raw);
  if (!n) return null;
  return `https://wa.me/${n}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** A wa.me share link (no specific recipient) that pre-fills text. */
export function waShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
