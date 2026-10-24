"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { cn } from "@/lib/cn";

/**
 * One button vocabulary for the whole medical surface.
 *
 * The thing this prevents: a save button that looks one way on the product
 * page and another in the quotation drawer. Variants are named for their job,
 * not their colour, so a screen asks for the primary action rather than for
 * "the teal one" — and when the palette moves, nothing has to be found and
 * renamed.
 *
 * Every variant carries default, hover, focus-visible, active and disabled.
 * Shipping a control with half of those is how an interface starts to feel
 * subtly broken without anyone being able to say why.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "quiet" | "onDark";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "medi-press medi-focus inline-flex items-center justify-center gap-2 rounded-lg font-semibold " +
  "whitespace-nowrap disabled:pointer-events-none disabled:opacity-55";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-medi-teal-600 text-white hover:bg-medi-teal-700 active:bg-medi-teal-700 " +
    "disabled:bg-medi-disabled",
  // A hairline, not a border property: a 1px border changes the box and makes
  // a secondary button a pixel taller than the primary beside it.
  secondary:
    "bg-white text-medi-ink shadow-[inset_0_0_0_1px_var(--color-medi-rule-strong)] " +
    "hover:shadow-[inset_0_0_0_1px_var(--color-medi-teal-600)] hover:text-medi-teal-700",
  ghost:
    "bg-medi-mint-50 text-medi-teal-700 hover:bg-medi-mint-100 active:bg-medi-mint-200",
  quiet: "text-medi-body hover:bg-medi-mint-50 hover:text-medi-ink",
  // On the two dark bands. White-on-teal at the sizes used there, which the
  // palette measures at 4.72:1 and over.
  onDark:
    "bg-white text-medi-teal-800 hover:bg-medi-mint-100 " +
    "focus-visible:shadow-[0_0_0_2px_var(--color-medi-teal-900),0_0_0_4px_#fff]",
};

const SIZES: Record<ButtonSize, string> = {
  // 36px, 44px, 52px. The middle one is the phone target minimum, which is why
  // it is the default on every customer-facing surface.
  sm: "h-9 px-3.5 text-[0.8125rem]",
  md: "h-11 px-5 text-[0.875rem]",
  lg: "h-[3.25rem] px-7 text-[0.9375rem]",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], className);
}

export function MedicalButton({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <button {...props} className={buttonClass(variant, size, className)}>
      {children}
    </button>
  );
}

/** The same vocabulary for a link, with the shared pending spinner. */
export function MedicalButtonLink({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ComponentProps<typeof MedicalLink> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}) {
  return (
    <MedicalLink {...props} className={buttonClass(variant, size, className)}>
      {children}
    </MedicalLink>
  );
}

/**
 * A submit button that shows its own spinner while the form's server action
 * runs.
 *
 * A medical twin of the mall's `SubmitButton` for the same reason
 * `MedicalLink` exists: that one hard-codes `niki-focus`, which draws an
 * orange ring, and `cn` here is plain clsx with no tailwind-merge — so passing
 * `medi-focus` alongside it leaves both classes on the element and the ring
 * that wins is whichever rule happens to be later in the stylesheet. A focus
 * ring decided by CSS source order is one that will eventually turn orange on
 * a teal console without anybody touching this file.
 */
export function MedicalSubmit({
  variant = "primary",
  size = "sm",
  className,
  pendingLabel,
  icon,
  children,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pendingLabel?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending || undefined}
      className={buttonClass(variant, size, className)}
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
