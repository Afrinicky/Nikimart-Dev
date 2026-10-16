"use client";

import { Eye, Headphones, MessageCircle, Phone } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";

/**
 * The actions on one tracked order: look at it, or get hold of somebody.
 *
 * The tracker exists to surface orders that have stopped moving, and the only
 * useful response to one is a conversation — with the buyer who is waiting,
 * or with whoever is sitting on it. So the contact affordances are on the row
 * rather than two screens away, in the same chat-bubble language as the
 * support dock that floats over the console.
 */
export function TrackerRowActions({
  href,
  orderNumber,
  phone,
  whatsapp,
  email,
  message,
}: {
  href: string;
  orderNumber: string;
  phone?: string;
  /** The buyer's number in wa.me form, when it could be normalised. */
  whatsapp?: string;
  email: string;
  /** Pre-filled text for the chat, so the admin does not retype the order. */
  message: string;
}) {
  const icon =
    "niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-niki-edge";

  return (
    <div className="flex items-center gap-1.5">
      <ActionLink
        href={href}
        aria-label={`Open order ${orderNumber}`}
        title="Open the full order"
        className={`${icon} text-niki-trust hover:bg-niki-trust/10`}
      >
        <Eye className="h-4 w-4" />
      </ActionLink>

      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Message the buyer on WhatsApp"
          title="WhatsApp the buyer about this order"
          className={`${icon} text-niki-success hover:bg-niki-success/10`}
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : null}

      {phone ? (
        <a
          href={`tel:${phone}`}
          aria-label="Call the buyer"
          title="Call the buyer"
          className={`${icon} text-niki-ink/55 hover:bg-niki-black/5`}
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(`Your order ${orderNumber}`)}&body=${encodeURIComponent(message)}`}
          aria-label="Email the buyer"
          title="Email the buyer — no phone number on this account"
          className={`${icon} text-niki-ink/55 hover:bg-niki-black/5`}
        >
          <Headphones className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
