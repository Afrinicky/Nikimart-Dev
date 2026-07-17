"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { registerAction, type AuthFormState } from "@/lib/auth-actions";

export function RegisterForm({
  pickupPoints = [],
}: {
  pickupPoints?: { id: string; name: string; locationName: string }[];
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(registerAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {state.error ? (
        <p className="rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <Field label="Full name" htmlFor="name" hint={state.fieldErrors?.name}>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="Ama Mensah"
          className={inputClass}
        />
      </Field>
      <Field label="Email address" htmlFor="email" hint={state.fieldErrors?.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          className={inputClass}
        />
      </Field>
      <Field label="Phone number" htmlFor="phone" hint={state.fieldErrors?.phone}>
        <input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="024 000 0000"
          className={inputClass}
        />
      </Field>
      <Field label="Password" htmlFor="password" hint={state.fieldErrors?.password}>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="At least 8 characters"
          className={inputClass}
        />
      </Field>

      <Field
        label="Delivery address"
        htmlFor="address"
        hint={state.fieldErrors?.address ?? "Optional — we'll pre-fill it at checkout"}
      >
        <textarea
          id="address"
          name="address"
          rows={2}
          placeholder="Hall / hostel, room, area, city…"
          className={inputClass}
        />
      </Field>

      {pickupPoints.length > 0 ? (
        <Field
          label="Preferred pickup centre"
          htmlFor="preferredPickupId"
          hint="Optional — your default collection point"
        >
          <select id="preferredPickupId" name="preferredPickupId" defaultValue="" className={inputClass}>
            <option value="">No preference</option>
            {pickupPoints.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.locationName}
              </option>
            ))}
          </select>
        </Field>
      ) : null}

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
