"use client";

import { Eye, Mail, MessageCircle, Phone } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { cn } from "@/lib/cn";

/**
 * The actions on one complaint: open it, or reach the person.
 *
 * The contact buttons carry the complaint's own subject into the message, so
 * the admin does not retype what they are ringing about — a complaint is
 * settled by talking to somebody, and every minute spent finding their number
 * is a minute it is getting older.
 */
export function ComplaintRowActions({
  href,
  subject,
  phone,
  whatsapp,
  email,
  message,
}: {
  href: string;
  subject: string;
  phone?: string;
  /** The person's number in wa.me form, when it could be normalised. */
  whatsapp?: string;
  email?: string;
  message: string;
}) {
  const icon =
    "niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 ring-niki-edge";

  return (
    <div className="flex items-center gap-1.5">
      <ActionLink
        href={href}
        aria-label={`Open ${subject}`}
        title="Open it"
        className={cn(icon, "text-niki-trust hover:bg-niki-trust/10")}
      >
        <Eye className="h-4 w-4" />
      </ActionLink>

      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Message on WhatsApp"
          title="WhatsApp them about this"
          className={cn(icon, "text-niki-success hover:bg-niki-success/10")}
        >
          <MessageCircle className="h-4 w-4" />
        </a>
      ) : null}

      {phone ? (
        <a
          href={`tel:${phone}`}
          aria-label="Call"
          title="Call them"
          className={cn(icon, "text-niki-ink/55 hover:bg-niki-black/5")}
        >
          <Phone className="h-4 w-4" />
        </a>
      ) : null}

      {email ? (
        <a
          href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
          aria-label="Email"
          title="Email them"
          className={cn(icon, "text-niki-ink/55 hover:bg-niki-black/5")}
        >
          <Mail className="h-4 w-4" />
        </a>
      ) : null}
    </div>
  );
}
