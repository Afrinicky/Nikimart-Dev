"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { FormFeedback } from "@/components/ui/FormFeedback";

/**
 * What a delete action may hand back.
 *
 * Nothing means it worked, which is what most of them return. An action that
 * can fail for a reason worth reading returns `{ error }` instead.
 */
export type DeleteResult = { error?: string } | void;

function Inner({ label, disabled, title }: { label: string; disabled?: boolean; title?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      title={title}
      onClick={(e) => {
        if (!confirm("Are you sure? This cannot be undone.")) e.preventDefault();
      }}
      className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-danger transition-colors hover:bg-niki-danger/10 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "…" : label}
    </button>
  );
}

/**
 * A delete control that posts a server action with a hidden `id`.
 *
 * The action is called with the form data and nothing else, so every existing
 * one keeps working untouched. What is new is that a returned `{ error }` is
 * shown — beside the button, in the row the person clicked in.
 *
 * That matters because a delete that failed used to look identical to one that
 * was not permitted: the button greyed out for a moment, the row stayed exactly
 * where it was, and the reason went nowhere. People read the grey button as
 * "you can't do this" and went hunting for a permission that was never the
 * problem.
 */
export function DeleteButton({
  id,
  action,
  label = "Delete",
  disabled,
  title,
}: {
  id: string;
  action: (formData: FormData) => DeleteResult | Promise<DeleteResult>;
  label?: string;
  disabled?: boolean;
  title?: string;
}) {
  const [error, setError] = useState("");

  // `<form action={fn}>` calls `fn(formData)` — one argument — so an action
  // written for a plain form and one that reports a failure are the same shape
  // here. Anything thrown is caught too: an action that blows up must not leave
  // the row looking like nothing happened.
  async function run(formData: FormData) {
    setError("");
    try {
      const result = await action(formData);
      if (result && typeof result === "object" && result.error) setError(result.error);
    } catch {
      setError("That didn't go through. Reload the page and try again.");
    }
  }

  return (
    <form action={run} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <Inner label={label} disabled={disabled} title={title} />
      {error ? <FormFeedback error={error} className="text-left" /> : null}
    </form>
  );
}
