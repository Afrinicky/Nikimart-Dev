"use client";

import { Eye, MessageCircle, Phone } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";

/**
 * The Actions cell for one order row.
 *
 * An eye and, where there is a number to ring, a chat bubble and a phone —
 * and nothing else. Everything that can be *done* to an order lives in the
 * window the eye opens, where there is room to say what each action means and
 * what it will change. A row of seven icons cannot say any of that, and the
 * two it would most need to — "place this with the supplier", "confirm the
 * forwarder has it" — are decisions, not buttons.
 *
 * The contact icons are the exception, because they are the reason this screen
 * was rebuilt: an admin looking at an order could not reach the person who
 * placed it without going and finding them.
 */
export function OrderRowActions({
  href,
  phone,
  whatsapp,
  orderNumber,
}: {
  href: string;
  phone?: string;
  /** The buyer's number in wa.me form, when it could be normalised. */
  whatsapp?: string;
  orderNumber: string;
}) {
  const iconBtn =
    "niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-trust ring-1 ring-niki-edge hover:bg-niki-trust/10";

  return (
    <div className="flex items-center gap-1.5">
      <ActionLink
        href={href}
        aria-label={`Open order ${orderNumber}`}
        title="Open the full order"
        className={iconBtn}
      >
        <Eye className="h-4 w-4" />
      </ActionLink>

      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Message the buyer on WhatsApp"
          title="WhatsApp the buyer"
          className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-success ring-1 ring-niki-edge hover:bg-niki-success/10"
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : null}

      {phone ? (
        <a
          href={`tel:${phone}`}
          aria-label="Call the buyer"
          title="Call the buyer"
          className="niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-ink/55 ring-1 ring-niki-edge hover:bg-niki-black/5"
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
