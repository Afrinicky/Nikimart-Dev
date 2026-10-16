"use client";

import { useActionState, useState } from "react";
import { Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import {
  FLYER_ALIGNMENTS,
  FLYER_FONTS,
  FLYER_SLOTS,
  FLYER_TEXT_KEYS,
  FLYER_TEXT_LABELS,
  FLYER_WEIGHTS,
  MAX_FLYER_EXTRAS,
  PRODUCT_FLYER_THEMES,
  designTheme,
  type FlyerAlign,
  type FlyerDesign,
  type FlyerExtra,
  type FlyerFontKey,
  type FlyerSlot,
  type FlyerTextKey,
  type FlyerTextStyle,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import { useShareImage } from "@/components/affiliate/share-canvas";
import { FlyerCanvasEditor } from "@/components/affiliate/FlyerCanvasEditor";
import {
  ColourField,
  Picker,
  Row,
  Section,
  Slider,
  Switch,
  TextField,
} from "@/components/affiliate/DesignControls";
import { cn } from "@/lib/cn";

/**
 * The flyer designer.
 *
 * One component for both the admin, who sets the house style, and the
 * affiliate, who may make it theirs — the only difference is the fallback
 * "reset" goes back to and the action it saves through. That matters: if the
 * two were separate editors they would drift, and an affiliate would end up
 * able to change something an admin could not.
 *
 * The flyer itself is the editor: tap a part of it to select it, drag to move
 * it, pull a corner or pinch to resize. That is the surface people reach for,
 * and it is a real flyer rather than a mock-up — the same canvas the share
 * sheet draws, at full resolution, scaled by CSS — so the editor and the
 * output cannot disagree.
 *
 * The panels beside it are the precision pass: exact sizes, faces, slots and
 * the frame's own geometry, for the person who knows they want 34px. They are
 * not the way in, which is what the first version of this got wrong.
 */

const FONT_OPTIONS = FLYER_FONTS.map((f) => ({ value: f.key, label: f.label }));
const WEIGHT_OPTIONS = FLYER_WEIGHTS.map((w) => ({ value: String(w.value), label: w.label }));
const SLOT_OPTIONS = FLYER_SLOTS.map((s) => ({ value: s.key, label: s.label }));
const ALIGN_OPTIONS = FLYER_ALIGNMENTS.map((a) => ({ value: a.key, label: a.label }));

export interface FlyerDesignerAction {
  (state: { ok?: boolean; error?: string; message?: string }, fd: FormData): Promise<{
    ok?: boolean;
    error?: string;
    message?: string;
  }>;
}

export function FlyerDesigner({
  initial,
  /** What "reset" goes back to: the house design, or the built-in one. */
  fallback,
  fallbackLabel,
  sample,
  sampleImageUrl,
  action,
  /** True when the current design is this person's own rather than inherited. */
  custom,
  savingLabel = "Save design",
}: {
  initial: FlyerDesign;
  fallback: FlyerDesign;
  fallbackLabel: string;
  sample: ProductFlyerData;
  sampleImageUrl: string | null;
  action: FlyerDesignerAction;
  custom?: boolean;
  savingLabel?: string;
}) {
  const [design, setDesign] = useState<FlyerDesign>(initial);
  const [state, submit, saving] = useActionState(action, {});
  const image = useShareImage(sampleImageUrl);
  const theme = designTheme(design);

  function patch(next: Partial<FlyerDesign>) {
    setDesign((d) => ({ ...d, ...next }));
  }

  function patchText(key: FlyerTextKey, next: Partial<FlyerTextStyle>) {
    setDesign((d) => ({ ...d, text: { ...d.text, [key]: { ...d.text[key], ...next } } }));
  }

  function patchExtra(id: string, next: Partial<FlyerExtra>) {
    setDesign((d) => ({
      ...d,
      extras: d.extras.map((e) => (e.id === id ? { ...e, ...next } : e)),
    }));
  }

  function removeExtra(id: string) {
    setDesign((d) => ({ ...d, extras: d.extras.filter((e) => e.id !== id) }));
  }

  const hiddenCount = FLYER_TEXT_KEYS.filter((k) => !design.text[k].visible).length;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
      {/* The flyer, and the only tools most people will need. Sticky, because
          the precision panels are longer than it is and an editor you cannot
          see the result of is a guessing game. */}
      <div className="lg:sticky lg:top-24 lg:self-start">
        <FlyerCanvasEditor design={design} onChange={setDesign} data={sample} image={image} />

        <p className="mt-2 text-[11px] leading-relaxed text-niki-ink/45">
          A real flyer, drawn exactly as it will be shared — only the product is a sample.
        </p>

        <form action={submit} className="mt-3 space-y-2">
          <input type="hidden" name="design" value={JSON.stringify(design)} />
          <button
            type="submit"
            disabled={saving}
            className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savingLabel}
          </button>

          <button
            type="button"
            onClick={() => setDesign(fallback)}
            className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-black/5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Back to {fallbackLabel}
          </button>

          {state.error ? (
            <p className="rounded-xl bg-niki-danger/10 px-3 py-2 text-center text-[11px] font-semibold text-niki-danger">
              {state.error}
            </p>
          ) : null}
          {state.message ? (
            <p className="rounded-xl bg-niki-success/10 px-3 py-2 text-center text-[11px] font-semibold text-niki-success">
              {state.message}
            </p>
          ) : null}
          {custom && !state.message ? (
            <p className="text-center text-[11px] text-niki-ink/45">
              You&apos;re using your own design rather than {fallbackLabel}.
            </p>
          ) : null}
        </form>
      </div>

      {/* The precision pass. Everything here can be done on the flyer itself;
          this is for the person who knows they want 34px and a particular
          slot, and for the few things that have no box to tap — the colourway,
          the frame's corner radius, the badge's words. */}
      <div className="space-y-3">
        <p className="rounded-xl bg-niki-surface px-3.5 py-2.5 text-xs leading-relaxed text-niki-ink/55">
          Most edits are quicker on the flyer above — tap a part, drag it, pull its corner. These
          panels are for exact numbers and the few things that have nothing to tap.
        </p>

        <Section title="Colours" hint="The colourway, and anything you want to override." defaultOpen>
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-niki-ink/70">Colourway</span>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PRODUCT_FLYER_THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => patch({ theme: t.key })}
                  aria-pressed={t.key === design.theme}
                  className={cn(
                    "niki-press niki-focus rounded-xl px-1.5 py-2 text-[10px] font-semibold ring-1 transition-colors",
                    t.key === design.theme
                      ? "bg-niki-orange/10 text-niki-orange ring-niki-orange"
                      : "bg-white text-niki-ink/60 ring-niki-edge hover:bg-niki-black/5",
                  )}
                >
                  <span
                    aria-hidden
                    className="mx-auto mb-1 block h-5 w-full rounded-md ring-1 ring-niki-black/10"
                    style={{ background: `linear-gradient(135deg, ${t.backdropFrom}, ${t.accent})` }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-niki-edge pt-3">
            <ColourField
              label="Background top"
              value={design.colours.backdropFrom}
              fallback={theme.backdropFrom}
              onChange={(v) => patch({ colours: { ...design.colours, backdropFrom: v } })}
            />
            <ColourField
              label="Background bottom"
              value={design.colours.backdropTo}
              fallback={theme.backdropTo}
              onChange={(v) => patch({ colours: { ...design.colours, backdropTo: v } })}
            />
            <ColourField
              label="Accent — badge and link bar"
              value={design.colours.accent}
              fallback={theme.accent}
              onChange={(v) => patch({ colours: { ...design.colours, accent: v } })}
            />
            <ColourField
              label="Price pill"
              value={design.colours.highlight}
              fallback={theme.highlight}
              onChange={(v) => patch({ colours: { ...design.colours, highlight: v } })}
            />
            <ColourField
              label="Lettering"
              value={design.colours.ink}
              fallback={theme.ink}
              onChange={(v) => patch({ colours: { ...design.colours, ink: v } })}
            />
            <ColourField
              label="Behind the picture"
              value={design.colours.card}
              fallback={theme.card}
              onChange={(v) => patch({ colours: { ...design.colours, card: v } })}
            />
            <ColourField
              label="Discount flash"
              value={design.colours.discount}
              fallback="#dc2626"
              allowInherit={false}
              onChange={(v) => patch({ colours: { ...design.colours, discount: v } })}
            />
          </div>
        </Section>

        <Section
          title="The picture"
          hint="How much of the flyer the product takes up, and where it sits."
        >
          <Slider
            label="Height"
            value={design.frame.height}
            min={200}
            max={1000}
            step={10}
            suffix="px"
            onChange={(v) => patch({ frame: { ...design.frame, height: v } })}
          />
          <Row>
            <Slider
              label="From the top"
              value={design.frame.top}
              min={0}
              max={600}
              step={4}
              suffix="px"
              onChange={(v) => patch({ frame: { ...design.frame, top: v } })}
            />
            <Slider
              label="Side margin"
              value={design.frame.side}
              min={0}
              max={240}
              step={2}
              suffix="px"
              onChange={(v) => patch({ frame: { ...design.frame, side: v } })}
            />
          </Row>
          <Slider
            label="Corner rounding"
            value={design.frame.radius}
            min={0}
            max={160}
            step={2}
            suffix="px"
            onChange={(v) => patch({ frame: { ...design.frame, radius: v } })}
          />
        </Section>

        <Section title="The link bar" hint="The bar along the bottom that carries the link.">
          <Row>
            <Slider
              label="Height"
              value={design.footer.height}
              min={48}
              max={220}
              step={2}
              suffix="px"
              onChange={(v) => patch({ footer: { ...design.footer, height: v } })}
            />
            <Slider
              label="From the bottom"
              value={design.footer.bottom}
              min={16}
              max={300}
              step={2}
              suffix="px"
              onChange={(v) => patch({ footer: { ...design.footer, bottom: v } })}
            />
          </Row>
          <Slider
            label="Corner rounding"
            value={design.footer.radius}
            min={0}
            max={110}
            step={2}
            suffix="px"
            onChange={(v) => patch({ footer: { ...design.footer, radius: v } })}
          />
        </Section>

        <Section title="Badge & price" hint="The corner badge and the pill behind the price.">
          <TextField
            label="Badge wording"
            value={design.badge.label}
            maxLength={24}
            placeholder="NICKIMART"
            onChange={(v) => patch({ badge: { ...design.badge, label: v } })}
          />
          <Slider
            label="Badge rounding"
            value={design.badge.radius}
            min={0}
            max={60}
            suffix="px"
            onChange={(v) => patch({ badge: { ...design.badge, radius: v } })}
          />
          <Switch
            label="Highlighter pill behind the price"
            hint="Off leaves the price as plain lettering."
            checked={design.pricePill}
            onChange={(v) => patch({ pricePill: v })}
          />
        </Section>

        <Section
          title="Lettering"
          hint="Every line on the flyer. Switch one off to take it away."
          badge={
            hiddenCount > 0 ? (
              <span className="rounded-md bg-niki-ink/10 px-1.5 py-0.5 text-[10px] font-bold text-niki-ink/55">
                {hiddenCount} off
              </span>
            ) : null
          }
        >
          <div className="space-y-2">
            {FLYER_TEXT_KEYS.map((key) => (
              <TextStyleRow
                key={key}
                label={FLYER_TEXT_LABELS[key]}
                style={design.text[key]}
                onChange={(next) => patchText(key, next)}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Added features"
          hint="Anything you put on the flyer yourself — your own wording, or a second copy of one of its own parts."
          badge={
            design.extras.length > 0 ? (
              <span className="rounded-md bg-niki-orange/10 px-1.5 py-0.5 text-[10px] font-bold text-niki-orange">
                {design.extras.length}
              </span>
            ) : null
          }
        >
          {design.extras.length === 0 ? (
            <p className="rounded-xl bg-niki-surface px-3 py-3 text-[11px] text-niki-ink/55">
              Nothing added yet. Use <strong className="font-semibold text-niki-ink/70">Add a
              line</strong> under the flyer — a line of your own is the quickest way to make it look
              like yours rather than everybody&apos;s.
            </p>
          ) : null}

          <div className="space-y-2">
            {design.extras.map((extra) => (
              <div key={extra.id} className="rounded-xl bg-niki-surface p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    {extra.source === "custom" ? (
                      <TextField
                        label="Wording"
                        value={extra.text}
                        maxLength={80}
                        onChange={(v) => patchExtra(extra.id, { text: v })}
                      />
                    ) : (
                      // A borrowed feature has no words of its own: it draws
                      // the product's, and saying so is more use than an input
                      // that would be ignored.
                      <div>
                        <span className="mb-1.5 block text-xs font-semibold text-niki-ink/70">
                          Shows
                        </span>
                        <p className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge">
                          {FLYER_TEXT_LABELS[extra.source]} — follows the product
                        </p>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeExtra(extra.id)}
                    title="Remove this line"
                    className="niki-press mt-5 shrink-0 rounded-lg p-2 text-niki-ink/45 ring-1 ring-niki-edge hover:bg-white hover:text-niki-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-2">
                  <Row>
                    <Picker
                      label="Where"
                      value={extra.slot}
                      options={SLOT_OPTIONS}
                      onChange={(v) => patchExtra(extra.id, { slot: v as FlyerSlot })}
                    />
                    <Picker
                      label="Align"
                      value={extra.align}
                      options={ALIGN_OPTIONS}
                      onChange={(v) => patchExtra(extra.id, { align: v as FlyerAlign })}
                    />
                  </Row>
                </div>

                <div className="mt-2">
                  <ColourField
                    label="Pill behind it"
                    value={extra.background}
                    fallback={theme.accent}
                    onChange={(v) => patchExtra(extra.id, { background: v })}
                  />
                </div>

                <div className="mt-2">
                  <TextStyleRow
                    label="Lettering"
                    style={extra.style}
                    onChange={(next) => patchExtra(extra.id, { style: { ...extra.style, ...next } })}
                    hideVisibility
                  />
                </div>
              </div>
            ))}
          </div>

          {design.extras.length > 0 ? (
            <p className="mt-1 text-[11px] text-niki-ink/45">
              Add and delete lines on the flyer itself — {MAX_FLYER_EXTRAS} is the most it carries.
            </p>
          ) : null}
        </Section>
      </div>
    </div>
  );
}

/**
 * One line's type, folded away until somebody wants it.
 *
 * The switch is outside the disclosure on purpose: taking an element off the
 * flyer is the most common thing anybody does here, and it should not be two
 * clicks deep.
 */
function TextStyleRow({
  label,
  style,
  onChange,
  hideVisibility = false,
}: {
  label: string;
  style: FlyerTextStyle;
  onChange: (next: Partial<FlyerTextStyle>) => void;
  hideVisibility?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={cn(
        "rounded-xl ring-1 transition-colors",
        style.visible ? "bg-white ring-niki-edge" : "bg-niki-surface ring-niki-edge",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {!hideVisibility ? (
          <input
            type="checkbox"
            checked={style.visible}
            onChange={(e) => onChange({ visible: e.target.checked })}
            aria-label={`Show ${label}`}
            className="h-4 w-4 shrink-0 accent-niki-orange"
          />
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="niki-focus min-w-0 flex-1 text-left"
        >
          <span
            className={cn(
              "block truncate text-xs font-semibold",
              style.visible ? "text-niki-ink" : "text-niki-ink/40 line-through",
            )}
          >
            {label}
          </span>
          <span className="block truncate font-mono text-[10px] text-niki-ink/40">
            {style.size}px · {FLYER_FONTS.find((f) => f.key === style.font)?.label ?? style.font}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="niki-press shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-niki-ink/50 ring-1 ring-niki-edge hover:bg-niki-surface"
        >
          {open ? "Done" : "Edit"}
        </button>
      </div>

      {open ? (
        <div className="space-y-3 border-t border-niki-edge px-3 py-3">
          <Slider
            label="Size"
            value={style.size}
            min={10}
            max={200}
            suffix="px"
            onChange={(v) => onChange({ size: v })}
          />
          <Row>
            <Picker
              label="Face"
              value={style.font}
              options={FONT_OPTIONS}
              onChange={(v) => onChange({ font: v as FlyerFontKey })}
            />
            <Picker
              label="Weight"
              value={String(style.weight)}
              options={WEIGHT_OPTIONS}
              onChange={(v) => onChange({ weight: Number(v) })}
            />
          </Row>
          <ColourField
            label="Colour"
            value={style.color}
            fallback="#111827"
            onChange={(v) => onChange({ color: v })}
          />
          <Row>
            <Switch
              label="Italic"
              checked={style.italic}
              onChange={(v) => onChange({ italic: v })}
            />
            <Switch
              label="CAPITALS"
              checked={style.uppercase}
              onChange={(v) => onChange({ uppercase: v })}
            />
          </Row>
          <Row>
            <Slider
              label="Nudge across"
              value={style.dx}
              min={-400}
              max={400}
              step={2}
              suffix="px"
              onChange={(v) => onChange({ dx: v })}
            />
            <Slider
              label="Nudge down"
              value={style.dy}
              min={-400}
              max={400}
              step={2}
              suffix="px"
              onChange={(v) => onChange({ dy: v })}
            />
          </Row>
        </div>
      ) : null}
    </div>
  );
}
