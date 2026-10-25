"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { MedicalButton } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { FormField, TextBox } from "@/components/medical/ui/FormField";
import { trackRecord } from "@/lib/medical/quotations/track-actions";

/**
 * The reference and the email that went with it.
 *
 * Both, because either alone would let somebody read a stranger's dealings
 * with us — see the note in `track-actions.ts`. The failure message is the
 * same for a wrong reference and a wrong address, so this form cannot be used
 * to find out which references exist.
 */
export function TrackForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [found, setFound] = useState<string | null>(null);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setFound(null);

    start(async () => {
      const result = await trackRecord({ reference, email });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      if (result.kind === "request") {
        router.push(`/medicals/quotations/${result.token}`);
        return;
      }
      setFound(result.reference);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="medi-panel p-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Reference"
          htmlFor="reference"
          required
          hint="From your confirmation — QR-2026-0001 or SO-2026-0001."
        >
          <TextBox
            id="reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="QR-2026-0001"
            className="font-figures uppercase"
          />
        </FormField>

        <FormField label="Email" htmlFor="email" required hint="The address it was sent with.">
          <TextBox
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </FormField>
      </div>

      <MedicalButton type="submit" className="mt-5" disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Search className="h-4 w-4" aria-hidden />
        )}
        Look it up
      </MedicalButton>

      {message ? (
        <p role="alert" className="mt-4 text-[0.9375rem] font-medium text-medi-danger">
          {message}
        </p>
      ) : null}

      {found ? (
        <p role="status" className="mt-4 text-[0.9375rem] text-medi-body">
          <span className="font-semibold text-medi-ink">{found}</span> is one of ours.
          Orders are shown in your account rather than here —{" "}
          <MedicalLink
            href="/medicals/account"
            className="medi-focus rounded font-semibold text-medi-teal-700 hover:underline"
          >
            sign in to see it
          </MedicalLink>
          , or ring us and quote the reference.
        </p>
      ) : null}
    </form>
  );
}
