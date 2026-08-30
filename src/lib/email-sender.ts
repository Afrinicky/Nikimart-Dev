/**
 * What the configured email sender can actually do.
 *
 * Resend has a trap in it that costs people days: a brand-new account works
 * immediately with the shared `onboarding@resend.dev` sender, which is what
 * every tutorial and the app's own default use — but that sender will only
 * deliver to the email address the Resend account itself was registered with.
 * Send to a customer and the API returns 403 with a message about verifying a
 * domain. Nothing crashes. The order still completes. The receipt just never
 * arrives, for everyone except the person testing it, who gets theirs and
 * concludes email is working.
 *
 * So "is RESEND_API_KEY set" is the wrong question, and answering only that is
 * what makes this silent. These helpers answer the two real ones — can it send
 * at all, and can it send to a *customer* — separately, so the admin console
 * can show the difference.
 *
 * Deliberately free of `server-only` and of any import: it is pure string work
 * over env values, so it is unit-testable and safe to reason about in one read.
 */

/** Resend's shared sandbox domain. Deliverable only to the account owner. */
const SANDBOX_DOMAIN = "resend.dev";

export type EmailReadiness =
  /** No API key: every send is skipped. */
  | "off"
  /** Key present, but the from-address can't be parsed or has no domain. */
  | "invalid"
  /** Key present, sending from Resend's sandbox: owner-only delivery. */
  | "sandbox"
  /** Key present, sending from your own domain. */
  | "ready";

export interface EmailSenderStatus {
  readiness: EmailReadiness;
  /** True when a send is even attempted. */
  configured: boolean;
  /** True when a send is expected to reach an arbitrary customer. */
  deliverable: boolean;
  /** The from-address as configured. */
  from: string;
  /** The domain mail is sent from, or null when it couldn't be read. */
  domain: string | null;
  /** One sentence for an admin: what is true now, and what to do next. */
  detail: string;
}

/**
 * The domain of an RFC 5322 from-address, lowercased.
 *
 * Accepts both the bare `you@example.com` and the display form
 * `Nickimart <you@example.com>`; returns null for anything it can't read
 * rather than guessing, because a wrong answer here would be reported to an
 * admin as a working configuration.
 */
export function senderDomain(from: string): string | null {
  const address = from.includes("<") ? from.slice(from.lastIndexOf("<") + 1, from.lastIndexOf(">")) : from;
  const at = address.lastIndexOf("@");
  if (at < 1) return null;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase();
  // A domain needs at least one dot and no whitespace to be worth reporting.
  if (!domain || /\s/.test(domain) || !domain.includes(".")) return null;
  return domain;
}

/** True for `resend.dev` and any subdomain of it. */
export function isSandboxDomain(domain: string | null): boolean {
  if (!domain) return false;
  return domain === SANDBOX_DOMAIN || domain.endsWith(`.${SANDBOX_DOMAIN}`);
}

/** Classify the configured sender. `key` and `from` are the raw env values. */
export function describeEmailSender(
  key: string | undefined,
  from: string | undefined,
): EmailSenderStatus {
  const trimmedFrom = (from ?? "").trim();
  const domain = senderDomain(trimmedFrom);
  const base = { from: trimmedFrom, domain };

  if (!key?.trim()) {
    return {
      ...base,
      readiness: "off",
      configured: false,
      deliverable: false,
      detail:
        "Email is off — RESEND_API_KEY is not set, so every email is skipped and SMS carries " +
        "notifications on its own. Create a key at resend.com/api-keys and add it to the deployment.",
    };
  }

  if (!domain) {
    return {
      ...base,
      readiness: "invalid",
      configured: true,
      deliverable: false,
      detail:
        `RESEND_FROM ("${trimmedFrom}") isn't a usable sender address, so Resend will reject ` +
        'every send. It must be an email address, optionally with a display name: ' +
        '"Nickimart <orders@your-domain>".',
    };
  }

  if (isSandboxDomain(domain)) {
    return {
      ...base,
      readiness: "sandbox",
      configured: true,
      deliverable: false,
      detail:
        `Sending from Resend's shared sandbox (${domain}), which only delivers to the address ` +
        "your own Resend account is registered with — customers get nothing, and the send fails " +
        "quietly. Verify your domain at resend.com/domains, then set RESEND_FROM to an address " +
        "at it.",
    };
  }

  return {
    ...base,
    readiness: "ready",
    configured: true,
    deliverable: true,
    detail:
      `Sending as ${trimmedFrom}. Customers receive order confirmations, delivery updates and ` +
      `password-reset codes by email. If they stop arriving, check that ${domain} is still ` +
      "verified at resend.com/domains.",
  };
}

/**
 * A plain-text rendering of an HTML email body.
 *
 * Every email here goes out HTML-only today. Spam filters treat a missing
 * text/plain alternative as a signal, and a mail client that can't render HTML
 * shows an empty message — which for a password-reset code means the code is
 * simply gone. Cheap to fix, so it is fixed for every send rather than per
 * template.
 *
 * Block-level tags become line breaks so the shape of the message survives;
 * everything else is dropped. This handles the app's own templates, which are
 * built from string literals in this repo — it is not a general HTML parser.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n---\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
