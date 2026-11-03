"use client";

import { useActionState, useRef, useState } from "react";
import { ChevronDown, GripVertical, Image as ImageIcon, Loader2, Plus, Save, Trash2, Upload, X } from "lucide-react";
import { Field, inputBase, inputClass } from "@/components/ui/Field";
import {
  MAX_SERVICE_FIELDS,
  MAX_SERVICE_SPEEDS,
  SERVICE_FIELD_TYPES,
  newServiceField,
  newServiceSpeed,
  type ServiceField,
  type ServiceFieldType,
  type ServiceSpeed,
} from "@/lib/data-bundles/service-fields";
import { saveService, type ServiceAdminState } from "@/lib/data-bundles/service-admin-actions";
import { cn } from "@/lib/cn";

/**
 * The product editor.
 *
 * One screen for the whole service, because a service is one thing: a picture
 * and a name, the options somebody chooses between, and the questions each of
 * those options asks. Splitting them across four screens — which is what a row
 * per table would have meant — would have made adding a service a tour.
 *
 * The questions are the part that matters. They are what lets a new service be
 * added without a deploy, so the builder has to make the eight field types
 * obvious and the order easy to change, and it has to be usable by somebody
 * who has never thought about a form schema in their life.
 *
 * State is local and posted as JSON in two hidden inputs. The server re-reads
 * both through the same resolver the public form uses, so nothing the browser
 * sends is trusted — it decides what is shown, not what is stored.
 */

// A flyer frame is 1080px wide, so there is nothing to gain above this — and
// every pixel above it is weight in a form that is posted whole.
const MAX_IMAGE_DIM = 1080;
/** ~1.3MB of base64. Comfortably inside the request limit, with room to spare. */
const MAX_IMAGE_CHARS = 1_800_000;

/** Downscale an upload and hand back a data URL. Pictures are stored inline. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMAGE_DIM || height > MAX_IMAGE_DIM) {
          const scale = MAX_IMAGE_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, width, height);
        // JPEG whatever came in: a photograph as PNG is several times the
        // size for no visible gain, and this one travels inside a form post.
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export interface EditableVariant {
  id: string;
  name: string;
  description: string;
  price: number;
  agentPrice: number;
  turnaround: string;
  /** Whether the ordinary speed is offered at all. */
  standardEnabled: boolean;
  speeds: ServiceSpeed[];
  fields: ServiceField[];
  isActive: boolean;
  order: number;
}

export interface EditableService {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  summary: string;
  imageUrl: string;
  icon: string;
  accentFrom: string;
  accentTo: string;
  fields: ServiceField[];
  terms: string;
  isActive: boolean;
  onStore: boolean;
  order: number;
  variants: EditableVariant[];
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="mb-4">
        <h2 className="font-display font-bold text-niki-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-xs text-niki-ink/55">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-niki-surface px-4 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
      />
      <span>
        <span className="block text-sm font-semibold text-niki-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-niki-ink/55">{hint}</span> : null}
      </span>
    </label>
  );
}

/** One question, as a row in the builder. */
function FieldRow({
  field,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  field: ServiceField;
  index: number;
  count: number;
  onChange: (next: Partial<ServiceField>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(field.label === "");

  return (
    <li className="rounded-xl bg-niki-surface/70 ring-1 ring-niki-edge">
      <div className="flex items-center gap-2 p-2.5">
        <span className="hidden text-niki-ink/25 sm:block">
          <GripVertical className="h-4 w-4" />
        </span>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="What are you asking for?"
          className={cn(inputBase, "min-w-0 flex-1 py-2")}
        />
        <select
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as ServiceFieldType })}
          className={cn(inputBase, "w-36 shrink-0 py-2")}
          aria-label="Answer type"
        >
          {SERVICE_FIELD_TYPES.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="More options"
          aria-expanded={open}
          className="niki-press rounded-lg p-2 text-niki-ink/45 hover:bg-white hover:text-niki-ink"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this question"
          className="niki-press rounded-lg p-2 text-niki-ink/40 hover:bg-niki-danger/10 hover:text-niki-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-niki-edge p-3">
          <input
            value={field.hint}
            onChange={(e) => onChange({ hint: e.target.value })}
            placeholder="Helper line under the box (optional)"
            className={cn(inputClass, "py-2")}
          />

          {field.type === "select" ? (
            <textarea
              value={field.options.join("\n")}
              onChange={(e) =>
                onChange({ options: e.target.value.split("\n").map((o) => o.trim()).filter(Boolean) })
              }
              rows={3}
              placeholder={"One choice per line\nMale\nFemale"}
              className={cn(inputClass, "py-2")}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => onChange({ required: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
              />
              <span className="text-niki-ink/70">Required</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={field.half}
                onChange={(e) => onChange({ half: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
              />
              <span className="text-niki-ink/70">Half width</span>
            </label>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-niki-ink/55 hover:bg-white disabled:opacity-30"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === count - 1}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-niki-ink/55 hover:bg-white disabled:opacity-30"
              >
                Move down
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/** The whole question list, used for the service and for each variant. */
function FieldBuilder({
  fields,
  onChange,
  emptyLabel,
}: {
  fields: ServiceField[];
  onChange: (next: ServiceField[]) => void;
  emptyLabel: string;
}) {
  function patch(index: number, next: Partial<ServiceField>) {
    onChange(fields.map((f, i) => (i === index ? { ...f, ...next } : f)));
  }
  function move(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= fields.length) return;
    const next = [...fields];
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  }

  return (
    <div>
      {fields.length === 0 ? (
        <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/55">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <FieldRow
              key={i}
              field={f}
              index={i}
              count={fields.length}
              onChange={(next) => patch(i, next)}
              onRemove={() => onChange(fields.filter((_, j) => j !== i))}
              onMove={(dir) => move(i, dir)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => onChange([...fields, newServiceField()])}
        disabled={fields.length >= MAX_SERVICE_FIELDS}
        className="niki-press mt-3 flex items-center gap-1.5 rounded-lg bg-niki-surface px-3.5 py-2 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
        Add a question
      </button>
    </div>
  );
}

/** One option somebody chooses between, with its fee, speeds and extra questions. */
function VariantCard({
  variant,
  index,
  count,
  onChange,
  onRemove,
  onMove,
}: {
  variant: EditableVariant;
  index: number;
  count: number;
  onChange: (next: Partial<EditableVariant>) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(variant.name === "");
  const margin = Math.round((variant.price - variant.agentPrice) * 100) / 100;
  // Something has to be choosable, or the option is unsellable.
  const orderable = variant.standardEnabled || variant.speeds.some((s) => s.enabled);

  function patchSpeed(i: number, next: Partial<ServiceSpeed>) {
    onChange({ speeds: variant.speeds.map((s, j) => (j === i ? { ...s, ...next } : s)) });
  }

  return (
    <li className="rounded-2xl bg-white ring-1 ring-niki-edge-strong">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <input
          value={variant.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Option name, e.g. Sole Proprietorship"
          className={cn(inputBase, "min-w-[12rem] flex-1 py-2 font-semibold")}
        />
        <label className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-niki-ink/45">Price</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={variant.price || ""}
            onChange={(e) => onChange({ price: Number(e.target.value) || 0 })}
            className={cn(inputBase, "w-28 py-2")}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-niki-ink/45">Agent cost</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={variant.agentPrice || ""}
            onChange={(e) => onChange({ agentPrice: Number(e.target.value) || 0 })}
            className={cn(inputBase, "w-28 py-2")}
          />
        </label>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label="More options"
          className="niki-press rounded-lg p-2 text-niki-ink/45 hover:bg-niki-surface hover:text-niki-ink"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove this option"
          className="niki-press rounded-lg p-2 text-niki-ink/40 hover:bg-niki-danger/10 hover:text-niki-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <p className="border-t border-niki-edge px-3 py-2 text-[11px] text-niki-ink/50">
        {variant.agentPrice > 0 ? (
          <>
            An agent is charged GH₵{variant.agentPrice.toFixed(2)} and keeps whatever they charge
            above it — GH₵{margin.toFixed(2)} at your own price.
          </>
        ) : (
          <>No agent cost set, so this option is sold on Nickimart&apos;s store only.</>
        )}
      </p>

      {open ? (
        <div className="space-y-4 border-t border-niki-edge p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Description" htmlFor={`desc-${index}`}>
              <input
                id={`desc-${index}`}
                value={variant.description}
                onChange={(e) => onChange({ description: e.target.value })}
                placeholder="One line about what this covers"
                className={inputClass}
              />
            </Field>
            <Field label="Turnaround" htmlFor={`turn-${index}`} hint="e.g. 10 working days">
              <input
                id={`turn-${index}`}
                value={variant.turnaround}
                onChange={(e) => onChange({ turnaround: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Delivery speed */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-niki-ink">Delivery speed</p>
            <p className="mb-2 text-xs text-niki-ink/55">
              The extra fee is added to what the customer pays and to the agent&apos;s cost alike,
              so expediting never moves anybody&apos;s commission.
            </p>

            {/* The ordinary lane, which is a choice like any other. */}
            <label
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 ring-1",
                variant.standardEnabled
                  ? "bg-white ring-niki-edge"
                  : "bg-niki-surface ring-niki-edge opacity-70",
              )}
            >
              <input
                type="checkbox"
                checked={variant.standardEnabled}
                onChange={(e) => onChange({ standardEnabled: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-niki-ink">Standard</span>
                <span className="block text-xs text-niki-ink/55">
                  {variant.turnaround || "The turnaround above"} · no extra charge
                </span>
              </span>
              {!variant.standardEnabled ? (
                <span className="shrink-0 rounded-md bg-niki-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-niki-ink/55">
                  Off
                </span>
              ) : null}
            </label>

            {variant.speeds.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {variant.speeds.map((s, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex flex-wrap items-center gap-2",
                      !s.enabled && "opacity-60",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) => patchSpeed(i, { enabled: e.target.checked })}
                      aria-label={`Offer ${s.label || "this speed"}`}
                      title="Offer this speed"
                      className="h-4 w-4 shrink-0 accent-[var(--color-niki-orange,#ff6a00)]"
                    />
                    <input
                      value={s.label}
                      onChange={(e) => patchSpeed(i, { label: e.target.value })}
                      placeholder="Fast track"
                      className={cn(inputBase, "min-w-[8rem] flex-1 py-2")}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={s.extraFee || ""}
                      onChange={(e) => patchSpeed(i, { extraFee: Number(e.target.value) || 0 })}
                      placeholder="Extra fee"
                      className={cn(inputBase, "w-28 py-2")}
                    />
                    <input
                      value={s.turnaround}
                      onChange={(e) => patchSpeed(i, { turnaround: e.target.value })}
                      placeholder="3 working days"
                      className={cn(inputBase, "w-40 py-2")}
                    />
                    <button
                      type="button"
                      onClick={() => onChange({ speeds: variant.speeds.filter((_, j) => j !== i) })}
                      aria-label="Remove this speed"
                      className="niki-press rounded-lg p-2 text-niki-ink/40 hover:bg-niki-danger/10 hover:text-niki-danger"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {!orderable ? (
              <p className="animate-fade-up mt-2 rounded-xl bg-niki-danger/10 px-4 py-2.5 text-xs font-medium text-niki-danger">
                Nobody can order this option: the standard speed is off and no faster one is
                switched on.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => onChange({ speeds: [...variant.speeds, newServiceSpeed()] })}
              disabled={variant.speeds.length >= MAX_SERVICE_SPEEDS}
              className="niki-press mt-2 flex items-center gap-1.5 rounded-lg bg-niki-surface px-3.5 py-2 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              Add a faster option
            </button>
          </div>

          {/* Variant-only questions */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-niki-ink">Questions for this option</p>
            <p className="mb-2 text-xs text-niki-ink/55">
              Asked after the service&apos;s own questions, and only when this option is chosen.
            </p>
            <FieldBuilder
              fields={variant.fields}
              onChange={(fields) => onChange({ fields })}
              emptyLabel="Nothing extra — this option asks the service's own questions only."
            />
          </div>

          <div className="flex flex-wrap items-center gap-4 border-t border-niki-edge pt-3 text-sm">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={variant.isActive}
                onChange={(e) => onChange({ isActive: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-niki-orange,#ff6a00)]"
              />
              <span className="text-niki-ink/70">On sale</span>
            </label>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => onMove(-1)}
                disabled={index === 0}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-niki-ink/55 hover:bg-niki-surface disabled:opacity-30"
              >
                Move up
              </button>
              <button
                type="button"
                onClick={() => onMove(1)}
                disabled={index === count - 1}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-niki-ink/55 hover:bg-niki-surface disabled:opacity-30"
              >
                Move down
              </button>
            </span>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export function ServiceForm({ initial }: { initial: EditableService }) {
  const [service, setService] = useState<EditableService>(initial);
  const [state, submit, saving] = useActionState<ServiceAdminState, FormData>(saveService, {});
  const [busyImage, setBusyImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(next: Partial<EditableService>) {
    setService((s) => ({ ...s, ...next }));
  }

  function patchVariant(index: number, next: Partial<EditableVariant>) {
    setService((s) => ({
      ...s,
      variants: s.variants.map((v, i) => (i === index ? { ...v, ...next } : v)),
    }));
  }

  function moveVariant(index: number, dir: -1 | 1) {
    const to = index + dir;
    if (to < 0 || to >= service.variants.length) return;
    const next = [...service.variants];
    [next[index], next[to]] = [next[to], next[index]];
    patch({ variants: next.map((v, i) => ({ ...v, order: i + 1 })) });
  }

  async function onPicture(files: FileList | null) {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setBusyImage(true);
    setImageError(null);
    try {
      const url = await fileToDataUrl(file);
      if (url.length > MAX_IMAGE_CHARS) {
        setImageError("That picture is too large even after resizing. Try a smaller one.");
        return;
      }
      patch({ imageUrl: url });
    } catch {
      setImageError("Couldn't read that picture. Try another file.");
    } finally {
      setBusyImage(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={submit} className="space-y-5">
      <input type="hidden" name="id" value={service.id} />
      <input type="hidden" name="imageUrl" value={service.imageUrl} />
      <input type="hidden" name="fields" value={JSON.stringify(service.fields)} />
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(service.variants.map((v, i) => ({ ...v, order: i + 1 })))}
      />

      {state.error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {state.error}
        </p>
      ) : null}

      <Section title="The listing" description="What a customer sees on the card and at the top of the form.">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="name">
                <input
                  id="name"
                  name="name"
                  required
                  value={service.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Business registration"
                  className={inputClass}
                />
              </Field>
              <Field label="Web address" htmlFor="slug" hint="/data-bundles/services/…">
                <input
                  id="slug"
                  name="slug"
                  value={service.slug}
                  onChange={(e) => patch({ slug: e.target.value })}
                  placeholder="business-registration"
                  className={inputClass}
                />
              </Field>
            </div>

            <Field label="Tagline" htmlFor="tagline" hint="One line under the name">
              <input
                id="tagline"
                name="tagline"
                value={service.tagline}
                onChange={(e) => patch({ tagline: e.target.value })}
                className={inputClass}
              />
            </Field>

            <Field label="Summary" htmlFor="summary" hint="Kept brief — it sits above the form">
              <textarea
                id="summary"
                name="summary"
                rows={3}
                value={service.summary}
                onChange={(e) => patch({ summary: e.target.value })}
                className={inputClass}
              />
            </Field>
          </div>

          {/* Picture */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-niki-ink">Picture</span>
            <div
              className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl text-4xl ring-1 ring-niki-edge"
              style={{
                background: `linear-gradient(135deg, ${service.accentFrom}, ${service.accentTo})`,
              }}
            >
              {service.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={service.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span>{service.icon || "📄"}</span>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => void onPicture(e.target.files)}
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busyImage}
                className="niki-press flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-niki-surface px-3 py-2 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-50"
              >
                {busyImage ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload
              </button>
              {service.imageUrl ? (
                <button
                  type="button"
                  onClick={() => patch({ imageUrl: "" })}
                  className="niki-press rounded-lg bg-niki-surface px-3 py-2 text-xs font-semibold text-niki-ink/60 hover:bg-niki-danger/10 hover:text-niki-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            {imageError ? (
              <p className="animate-fade-up mt-2 text-[11px] font-medium text-niki-danger">
                {imageError}
              </p>
            ) : (
              <p className="mt-1.5 flex items-start gap-1 text-[11px] text-niki-ink/45">
                <ImageIcon className="mt-0.5 h-3 w-3 shrink-0" />
                Also the picture the agent flyer is built around.
              </p>
            )}

            <div className="mt-3 grid grid-cols-3 gap-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-niki-ink/55">Icon</span>
                <input
                  name="icon"
                  value={service.icon}
                  onChange={(e) => patch({ icon: e.target.value })}
                  maxLength={4}
                  className={cn(inputClass, "px-2 py-1.5 text-center")}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-niki-ink/55">From</span>
                <input
                  type="color"
                  name="accentFrom"
                  value={service.accentFrom}
                  onChange={(e) => patch({ accentFrom: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-niki-edge-strong bg-white p-1"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-niki-ink/55">To</span>
                <input
                  type="color"
                  name="accentTo"
                  value={service.accentTo}
                  onChange={(e) => patch({ accentTo: e.target.value })}
                  className="h-9 w-full cursor-pointer rounded-lg border border-niki-edge-strong bg-white p-1"
                />
              </label>
            </div>
          </div>
        </div>
      </Section>

      <Section
        title="Options and pricing"
        description="What the customer chooses between. Each one carries its own fee, turnaround and extra questions."
      >
        {service.variants.length === 0 ? (
          <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/55">
            A service needs at least one option before it can be sold.
          </p>
        ) : (
          <ul className="space-y-3">
            {service.variants.map((v, i) => (
              <VariantCard
                key={v.id || `new-${i}`}
                variant={v}
                index={i}
                count={service.variants.length}
                onChange={(next) => patchVariant(i, next)}
                onRemove={() => patch({ variants: service.variants.filter((_, j) => j !== i) })}
                onMove={(dir) => moveVariant(i, dir)}
              />
            ))}
          </ul>
        )}

        <button
          type="button"
          onClick={() =>
            patch({
              variants: [
                ...service.variants,
                {
                  id: "",
                  name: "",
                  description: "",
                  price: 0,
                  agentPrice: 0,
                  turnaround: "",
                  standardEnabled: true,
                  speeds: [],
                  fields: [],
                  isActive: true,
                  order: service.variants.length + 1,
                },
              ],
            })
          }
          className="niki-press mt-3 flex items-center gap-1.5 rounded-lg bg-niki-orange/10 px-4 py-2.5 text-sm font-semibold text-niki-orange hover:bg-niki-orange/15"
        >
          <Plus className="h-4 w-4" />
          Add an option
        </button>
      </Section>

      <Section
        title="The form"
        description="What every applicant is asked, whichever option they choose. A document question is collected after payment."
      >
        <FieldBuilder
          fields={service.fields}
          onChange={(fields) => patch({ fields })}
          emptyLabel="No questions yet. Add what you need to start the work."
        />
      </Section>

      <Section title="Terms" description="Shown before payment, one point per line.">
        <textarea
          name="terms"
          rows={6}
          value={service.terms}
          onChange={(e) => patch({ terms: e.target.value })}
          placeholder={"Fees cover our service and the statutory charges.\nTurnaround runs from the day every document is received."}
          className={inputClass}
        />
      </Section>

      <Section title="Where it is sold">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle
            label="On sale"
            hint="Off suspends it everywhere without losing anything it holds."
            checked={service.isActive}
            onChange={(isActive) => patch({ isActive })}
          />
          <Toggle
            label="Show on Nickimart's own store"
            hint="Off leaves it to agent storefronts only."
            checked={service.onStore}
            onChange={(onStore) => patch({ onStore })}
          />
        </div>
        {service.isActive ? <input type="hidden" name="isActive" value="1" /> : null}
        {service.onStore ? <input type="hidden" name="onStore" value="1" /> : null}

        <div className="mt-3 max-w-[12rem]">
          <Field label="Sort order" htmlFor="order" hint="Lower comes first">
            <input
              id="order"
              name="order"
              type="number"
              min={0}
              value={service.order}
              onChange={(e) => patch({ order: Number(e.target.value) || 0 })}
              className={inputClass}
            />
          </Field>
        </div>
      </Section>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 border-t border-niki-edge bg-niki-surface/95 px-1 py-3 backdrop-blur">
        <button
          type="submit"
          disabled={saving}
          className="niki-press flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save product"}
        </button>
      </div>
    </form>
  );
}
