"use client";

import { Trash2 } from "lucide-react";
import { useFormStatus } from "react-dom";

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
 * `action` is a server action of shape (FormData) => void.
 */
export function DeleteButton({
  id,
  action,
  label = "Delete",
  disabled,
  title,
}: {
  id: string;
  action: (formData: FormData) => void | Promise<void>;
  label?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Inner label={label} disabled={disabled} title={title} />
    </form>
  );
}
