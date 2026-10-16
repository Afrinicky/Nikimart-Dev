"use client";

import { Banknote, Eye, Mail, MessageCircle, Phone } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The actions on one settlement row: settle it, or get hold of the shop.
 *
 * The contact buttons are on the row because the two things an admin does
 * with a settlement are pay it and ask about it — a missing MoMo number, a
 * disputed figure, a payment that never landed — and both were two screens
 * away before.
 */
export function SettlementRowActions({
  href,
  shopName,
  phone,
  whatsapp,
  email,
  message,
  payable,
}: {
  href: string;
  shopName: string;
  phone?: string;
  /** The shop's number in wa.me form, when it could be normalised. */
  whatsapp?: string;
  email: string;
  message: string;
  payable: boolean;
}) {
  const icon =
    "niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-niki-edge";

  return (
    <div className="flex items-center gap-1.5">
      <ActionLink
        href={href}
        aria-label={`Open ${shopName}`}
        title={payable ? "Settle this shop" : "Open the settlement"}
        className={cn(
          icon,
          payable
            ? "bg-niki-orange text-white ring-niki-orange hover:bg-niki-orange-light"
            : "text-niki-trust hover:bg-niki-trust/10",
        )}
      >
        {payable ? <Banknote className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </ActionLink>

      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Message the shop on WhatsApp"
          title="WhatsApp the shop"
          className={cn(icon, "text-niki-success hover:bg-niki-success/10")}
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : null}

      {phone ? (
        <a
          href={`tel:${phone}`}
          aria-label="Call the shop"
          title="Call the shop"
          className={cn(icon, "text-niki-ink/55 hover:bg-niki-black/5")}
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : email ? (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(`Nickimart settlement — ${shopName}`)}&body=${encodeURIComponent(message)}`}
          aria-label="Email the shop"
          title="Email the shop — no phone number on this account"
          className={cn(icon, "text-niki-ink/55 hover:bg-niki-black/5")}
        >
          <Mail className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
