"use client";

import { useActionState } from "react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { AcceptTerms } from "@/components/ui/AcceptTerms";
import { registerAction, type AuthFormState } from "@/lib/auth-actions";
import { FormFeedback } from "@/components/ui/FormFeedback";

export function RegisterForm({
  pickupPoints = [],
  callbackUrl,
}: {
  pickupPoints?: { id: string; name: string; locationName: string }[];
  callbackUrl?: string;
}) {
  const [state, formAction] = useActionState<AuthFormState, FormData>(registerAction, {});

  return (
    <form action={formAction} className="mt-6 space-y-4" noValidate>
      {callbackUrl ? <input type="hidden" name="callbackUrl" value={callbackUrl} /> : null}
      <Field label="Full name" htmlFor="name" hint={state.fieldErrors?.name}>
        <input
          id="name"
          name="name"
          type="text"
          defaultValue={state.values?.name ?? ""}
          key={state.values?.name ?? ""}
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
          defaultValue={state.values?.email ?? ""}
          key={state.values?.email ?? ""}
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
          defaultValue={state.values?.phone ?? ""}
          key={state.values?.phone ?? ""}
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

      <AcceptTerms audience="customer" error={state.fieldErrors?.acceptTerms} />

      <FormFeedback error={state.error} />
      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
