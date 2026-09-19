"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/**
 * A password field you can check before you commit to it.
 *
 * Typing a password blind on a phone keyboard is where most failed sign-ins
 * come from, and "invalid email or password" cannot tell somebody which half
 * they got wrong. The toggle is the field's own, never a form-wide one: it
 * reveals what this person typed on this device, and nothing is remembered
 * between renders.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [shown, setShown] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={shown ? "text" : "password"}
        className={cn(inputClass, "pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        // Not a tab stop: it sits between the password and the submit button,
        // and a keyboard user tabbing out of the field wants Sign in.
        tabIndex={-1}
        className="niki-focus absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-niki-ink/40 transition-colors hover:text-niki-ink"
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
