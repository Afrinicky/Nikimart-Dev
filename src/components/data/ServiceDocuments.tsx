"use client";

import { useRef, useState } from "react";
import { Check, Loader2, Paperclip, Upload } from "lucide-react";
import { uploadServiceDocument } from "@/lib/data-bundles/service-actions";
import { cn } from "@/lib/cn";

/**
 * Attaching documents to an order that has been paid for.
 *
 * This is the only place a customer's file is ever written, and it exists
 * because payment is the confirmation: an unpaid application is a form, and a
 * form is text. Somebody who fills in a long form and wanders off costs
 * nothing; somebody who did the same with three photographs of a Ghana Card
 * would cost megabytes a head.
 *
 * One upload per question, replacing whatever was there — which is what
 * somebody who photographed the wrong side of a card expects to be able to do.
 */

export interface DocumentSlot {
  key: string;
  label: string;
  required: boolean;
  hint: string;
  /** The file already attached, if any. */
  fileName: string | null;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function Slot({
  slot,
  reference,
  maxBytes,
}: {
  slot: DocumentSlot;
  reference: string;
  maxBytes: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(slot.fileName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > maxBytes) {
      const mb = (maxBytes / 1_000_000).toFixed(1).replace(/\.0$/, "");
      return setError(`That file is ${(file.size / 1_000_000).toFixed(1)}MB. The limit is ${mb}MB.`);
    }
    if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
      return setError("Attach a photo or a PDF.");
    }

    setBusy(true);
    try {
      const result = await uploadServiceDocument({
        reference,
        fieldKey: slot.key,
        label: slot.label,
        fileName: file.name,
        mimeType: file.type,
        dataUrl: await readFile(file),
      });
      if (!result.ok) setError(result.error);
      else setName(file.name);
    } catch {
      setError("Could not attach that file. Please try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <li
      className={cn(
        "rounded-xl px-4 py-3 ring-1",
        name ? "bg-niki-success/[0.06] ring-niki-success/25" : "bg-white ring-niki-edge",
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-niki-ink">
            {name ? (
              <Check className="h-4 w-4 text-niki-success" />
            ) : (
              <Paperclip className="h-4 w-4 text-niki-ink/35" />
            )}
            {slot.label}
            {slot.required && !name ? <span className="text-niki-danger">*</span> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-niki-ink/50">
            {name ?? slot.hint ?? "Photo or PDF"}
          </span>
        </span>

        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf"
          hidden
          onChange={(e) => void pick(e.target.files)}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className={cn(
            "niki-press flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-60",
            name
              ? "bg-niki-surface text-niki-ink/60 hover:bg-niki-black/5"
              : "bg-niki-black text-white",
          )}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {name ? "Replace" : "Attach"}
        </button>
      </div>

      {error ? (
        <p className="animate-fade-up mt-2 text-xs font-medium text-niki-danger">{error}</p>
      ) : null}
    </li>
  );
}

export function ServiceDocuments({
  reference,
  slots,
  maxBytes,
}: {
  reference: string;
  slots: DocumentSlot[];
  maxBytes: number;
}) {
  if (slots.length === 0) return null;

  const outstanding = slots.filter((s) => s.required && !s.fileName).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-display font-bold text-niki-ink">Documents</p>
        <p className="text-xs text-niki-ink/55">
          {outstanding === 0
            ? "Everything we need is in."
            : `${outstanding} still needed before we can start.`}
        </p>
      </div>
      <ul className="space-y-2">
        {slots.map((s) => (
          <Slot key={s.key} slot={s} reference={reference} maxBytes={maxBytes} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-niki-ink/45">
        Up to {(maxBytes / 1_000_000).toFixed(1).replace(/\.0$/, "")}MB each. Nothing was stored
        before your payment cleared.
      </p>
    </div>
  );
}
