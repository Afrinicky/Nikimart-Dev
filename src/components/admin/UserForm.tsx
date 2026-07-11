"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import type { CrudState } from "@/lib/admin-actions";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

type Action = (prev: CrudState, fd: FormData) => Promise<CrudState>;

export function UserForm({
  action,
  user,
  submitLabel,
}: {
  action: Action;
  user?: { name: string | null; email: string | null; phone: string | null; role: Role };
  submitLabel: string;
}) {
  const [state, formAction] = useActionState<CrudState, FormData>(action, {});
  const u = user;
  const isEdit = Boolean(user);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">{state.error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="name" hint={state.fieldErrors?.name}>
          <input id="name" name="name" defaultValue={u?.name ?? ""} required className={inputClass} />
        </Field>
        <Field label="Email" htmlFor="email" hint={state.fieldErrors?.email}>
          <input id="email" name="email" type="email" defaultValue={u?.email ?? ""} required className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone (optional)" htmlFor="phone">
          <input id="phone" name="phone" defaultValue={u?.phone ?? ""} className={inputClass} />
        </Field>
        <Field label="Role" htmlFor="role" hint={state.fieldErrors?.role}>
          <select id="role" name="role" defaultValue={u?.role ?? "CUSTOMER"} className={inputClass}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label={isEdit ? "New password (leave blank to keep)" : "Password"}
        htmlFor="password"
        hint={state.fieldErrors?.password}
      >
        <input
          id="password"
          name="password"
          type="password"
          required={!isEdit}
          placeholder={isEdit ? "••••••••" : "At least 8 characters"}
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <div className="w-40">
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
        <Link href="/admin/users" className="text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
          Cancel
        </Link>
      </div>
    </form>
  );
}
