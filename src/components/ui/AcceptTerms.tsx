"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * The "I've read the terms" gate on every registration form.
 *
 * Three things make this an acknowledgement rather than a formality: the box
 * starts empty, the documents are one tap away and open in their own tab so
 * reading one doesn't throw away a half-filled form, and the server checks the
 * value again — a checkbox is a claim from the browser, and consent is exactly
 * the kind of claim that must not be taken on trust.
 */

export interface PolicyLink {
  label: string;
  slug: string;
}

/** Who is registering decides which documents they are agreeing to. */
export const POLICY_SETS = {
  customer: [
    { label: "Terms & Conditions", slug: "terms" },
    { label: "Privacy Policy", slug: "privacy" },
  ],
  seller: [
    { label: "Terms & Conditions", slug: "terms" },
    { label: "Seller Policy", slug: "seller-policy" },
    { label: "Privacy Policy", slug: "privacy" },
  ],
  agent: [
    { label: "Terms & Conditions", slug: "terms" },
    { label: "Data Agent Policy", slug: "agent-policy" },
    { label: "Privacy Policy", slug: "privacy" },
  ],
} satisfies Record<string, PolicyLink[]>;

export type PolicyAudience = keyof typeof POLICY_SETS;

export function AcceptTerms({
  audience,
  error,
  onChange,
}: {
  audience: PolicyAudience;
  /** A message from the server when the box came back unticked. */
  error?: string;
  onChange?: (accepted: boolean) => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const policies = POLICY_SETS[audience];

  function set(next: boolean) {
    setAccepted(next);
    onChange?.(next);
  }

  return (
    <div
      className={cn(
        "rounded-2xl p-4 ring-1 transition-colors",
        error
          ? "bg-niki-danger/5 ring-niki-danger/40"
          : accepted
            ? "bg-niki-success/5 ring-niki-success/40"
            : "bg-niki-surface ring-niki-edge-strong",
      )}
    >
      {/*
        The tappable label holds no links.
        With the policy names inline, the middle of the label — where a thumb
        lands — was a link, so tapping to agree opened a policy instead. The
        checkbox and its sentence are one target; the documents sit below it,
        on their own line, where they are meant to be tapped.
      */}
      <label className="flex cursor-pointer items-start gap-3">
        {/* The real control, kept in the accessibility tree and reachable by
            keyboard; the square below is what's actually painted. */}
        <input
          type="checkbox"
          name="acceptTerms"
          value="yes"
          checked={accepted}
          onChange={(e) => set(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "acceptTerms-error" : "acceptTerms-policies"}
          className="peer sr-only"
        />
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition-all",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-niki-orange peer-focus-visible:ring-offset-2",
            accepted
              ? "bg-niki-success text-white ring-niki-success"
              : "bg-white ring-niki-edge-control",
          )}
        >
          {accepted ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
        </span>

        <span className="text-sm leading-relaxed text-niki-ink/75">
          I have read and agree to Nickimart&apos;s terms.
        </span>
      </label>

      <p id="acceptTerms-policies" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 pl-8 text-sm">
        {policies.map((p) => (
          <a
            key={p.slug}
            href={`/legal/${p.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-niki-orange underline underline-offset-2 hover:text-niki-orange-light"
          >
            {p.label}
          </a>
        ))}
      </p>

      {error ? (
        <p id="acceptTerms-error" role="alert" className="mt-2 pl-8 text-xs font-medium text-niki-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
