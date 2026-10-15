"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Download,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  Share2,
  SlidersHorizontal,
} from "lucide-react";
import {
  PRODUCT_FLYER_THEMES,
  flyerFileName,
  productFlyerShareText,
  type FlyerDesign,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import { photoFileName, type WatermarkConfig } from "@/lib/affiliate-watermark";
import {
  canvasToBlob,
  drawShare,
  saveBlob,
  shareCanvasSize,
  useShareImage,
  type ShareMode,
} from "@/components/affiliate/share-canvas";
import {
  recordAffiliateShare,
  savePromotedProduct,
  type ActionState,
} from "@/lib/affiliate-console-actions";
import { cn } from "@/lib/cn";

/**
 * The share studio — the data-bundle flyer studio applied to retail.
 *
 * Deliberately the same motion agents already know: pick a look, write a line,
 * press share. The canvas is the artwork itself at full resolution, scaled
 * down by CSS for the preview, so what goes out is exactly what is on screen;
 * the share sheet carries the image *as a file*, which is what puts it in
 * WhatsApp as a picture rather than a link somebody has to tap to see.
 *
 * Two things it can produce, and the difference is only ever the image. The
 * flyer is a poster: a frame, a headline, a price pill, a footer. The
 * photograph is the product's own picture, untouched but for the watermark —
 * which is what gets reposted to a status or cropped into a story, where a
 * poster would not. Both go out with the same caption and the same link.
 */
export function AffiliateFlyerStudio({
  /** The row on the affiliate's list, when it is on their list. */
  promotionId,
  data,
  imageUrl,
  /** The caption to start from: the product's, else the affiliate's, else the default. */
  initialMessage,
  initialMode = "flyer",
  /** The flyer design this affiliate's shares use, already layered. */
  design,
  /** The admin's watermark, for the photograph. */
  watermark,
  /** The brand mark the watermark may carry. Empty leaves it off. */
  logoUrl,
  /** The link, shown under the controls for copying on a desktop. */
  link,
}: {
  promotionId: string | null;
  data: Omit<ProductFlyerData, "message">;
  imageUrl: string | null;
  initialMessage: string;
  initialMode?: ShareMode;
  design: FlyerDesign;
  watermark: WatermarkConfig;
  logoUrl: string;
  link: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [mode, setMode] = useState<ShareMode>(initialMode);
  const [theme, setTheme] = useState(design.theme);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveState, save, saving] = useActionState<ActionState, FormData>(savePromotedProduct, {});

  const image = useShareImage(imageUrl);
  const logo = useShareImage(watermark.logo.enabled ? logoUrl : null);

  // The colourway is the one part of the design the studio itself can change:
  // it is a one-tap decision, and the rest lives in the designer.
  const activeDesign: FlyerDesign = { ...design, theme };
  const piece = {
    data: { ...data, message },
    design: activeDesign,
    watermark,
    image,
    logo,
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawShare(canvas, mode, piece);
    // The preview follows the caption as it is typed, so the dependencies are
    // the parts rather than the object rebuilt on every render.
  }, [data, message, theme, image, logo, mode, design, watermark]); // eslint-disable-line react-hooks/exhaustive-deps

  const size = shareCanvasSize(mode, image);
  const fileName = mode === "flyer" ? flyerFileName(data.name) : photoFileName(data.name);
  const shareText = productFlyerShareText({
    productName: data.name,
    price: data.price,
    shopName: data.shopName,
    link,
    template: message,
  });

  function noteShared() {
    if (!promotionId) return;
    const fd = new FormData();
    fd.set("id", promotionId);
    void recordAffiliateShare(fd).catch(() => {});
  }

  async function currentBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvasToBlob(canvas, mode);
  }

  async function download() {
    setBusy("download");
    setNote(null);
    const blob = await currentBlob();
    setBusy(null);
    if (!blob) return setNote("Couldn't build the image. Please try again.");
    saveBlob(blob, fileName);
    setNote("Saved to your downloads.");
  }

  /**
   * Share the image itself where the device can (Android and iOS both put
   * WhatsApp in that sheet), and fall back to saving it and opening WhatsApp
   * with the text — which is the two taps a desktop browser can manage.
   */
  async function share() {
    setBusy("share");
    setNote(null);
    const blob = await currentBlob();

    if (blob && typeof navigator !== "undefined" && "canShare" in navigator) {
      const file = new File([blob], fileName, { type: blob.type || "image/png" });
      const payload = { files: [file], text: shareText, title: data.name };
      if (navigator.canShare?.(payload)) {
        try {
          await navigator.share(payload);
          setBusy(null);
          noteShared();
          return;
        } catch (err) {
          // A cancelled share is not a failure — say nothing and stop.
          setBusy(null);
          if ((err as Error)?.name === "AbortError") return;
          setNote("Couldn't open the share sheet. Save the image and send it instead.");
          return;
        }
      }
    }

    if (blob) saveBlob(blob, fileName);
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
    setBusy(null);
    noteShared();
    setNote(
      mode === "flyer"
        ? "Flyer saved — attach it to the WhatsApp message that just opened."
        : "Picture saved — attach it to the WhatsApp message that just opened.",
    );
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setNote("Couldn't copy. Select the link below and copy it by hand.");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="mx-auto w-full max-w-md">
        {/* What is being made. Two words, because the difference is visible in
            the preview underneath the moment it is tapped. */}
        <div className="mb-3 inline-flex rounded-xl bg-niki-surface p-1 ring-1 ring-niki-edge">
          {(
            [
              { key: "flyer", label: "Flyer", icon: LayoutTemplate },
              { key: "photo", label: "Photo", icon: ImageIcon },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              aria-pressed={mode === option.key}
              className={cn(
                "niki-press niki-focus inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition-colors",
                mode === option.key
                  ? "bg-white text-niki-ink shadow-sm"
                  : "text-niki-ink/55 hover:text-niki-ink",
              )}
            >
              <option.icon className="h-3.5 w-3.5" />
              {option.label}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-2xl ring-1 ring-niki-edge">
          <canvas
            ref={canvasRef}
            width={size.width}
            height={size.height}
            className="block h-auto w-full bg-white"
            aria-label={mode === "flyer" ? `${data.name} flyer` : `${data.name} photo`}
            role="img"
          />
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-niki-ink/45">
          {mode === "flyer"
            ? "The poster: your picture, your words and your link, laid out and branded."
            : watermark.enabled
              ? "The product's own picture, untouched apart from the watermark. The caption and your link go in the message."
              : "The product's own picture, exactly as it is. The caption and your link go in the message."}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="flyer-message"
            className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45"
          >
            Your message
          </label>
          <textarea
            id="flyer-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={600}
            placeholder="Say why they should buy it…"
            className="mt-2 w-full rounded-xl border border-niki-edge-strong bg-white px-3 py-2.5 text-sm text-niki-ink outline-none transition-colors focus:border-niki-orange"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-niki-ink/45">
            {mode === "flyer" ? "Goes on the flyer and in the " : "Goes in the "}
            WhatsApp message. Use <code className="font-mono">{"{product}"}</code>,{" "}
            <code className="font-mono">{"{price}"}</code> or{" "}
            <code className="font-mono">{"{link}"}</code> and they&apos;ll be filled in.
          </p>
        </div>

        {mode === "flyer" ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
                Colour
              </p>
              <Link
                href="/affiliate/settings/flyer"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-niki-orange hover:underline"
              >
                <SlidersHorizontal className="h-3 w-3" />
                Design
              </Link>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {PRODUCT_FLYER_THEMES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTheme(t.key)}
                  aria-pressed={t.key === theme}
                  className={cn(
                    "niki-press niki-focus rounded-xl px-2 py-2.5 text-xs font-semibold ring-1 transition-colors",
                    t.key === theme
                      ? "bg-niki-orange/10 text-niki-orange ring-niki-orange"
                      : "bg-white text-niki-ink/60 ring-niki-edge hover:bg-niki-black/5",
                  )}
                >
                  <span
                    aria-hidden
                    className="mx-auto mb-1.5 block h-6 w-full rounded-md ring-1 ring-niki-black/10"
                    style={{ background: `linear-gradient(135deg, ${t.backdropFrom}, ${t.accent})` }}
                  />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <button
            type="button"
            onClick={share}
            disabled={busy !== null}
            className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-niki-success px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy === "share" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            Share to WhatsApp
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={download}
              disabled={busy !== null}
              className="niki-press niki-focus flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-bold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5 disabled:opacity-60"
            >
              {busy === "download" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Image
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="niki-press niki-focus flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-3 text-sm font-bold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-niki-success" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Link
                </>
              )}
            </button>
          </div>
        </div>

        {/* Saving the caption is only on offer for a product on their list —
            there is nowhere to keep it otherwise. */}
        {promotionId ? (
          <form action={save} className="space-y-2">
            <input type="hidden" name="id" value={promotionId} />
            <input type="hidden" name="shareMessage" value={message} />
            <input type="hidden" name="flyerTheme" value={theme} />
            <button
              type="submit"
              disabled={saving}
              className="niki-press niki-focus w-full rounded-xl bg-niki-black px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save as this product's default"}
            </button>
            {saveState.message ? (
              <p className="text-center text-[11px] font-semibold text-niki-success">
                {saveState.message}
              </p>
            ) : null}
            {saveState.error ? (
              <p className="text-center text-[11px] font-semibold text-niki-danger">
                {saveState.error}
              </p>
            ) : null}
          </form>
        ) : null}

        <p className="break-all rounded-xl bg-niki-surface px-3 py-2.5 font-mono text-[11px] text-niki-ink/60">
          {link}
        </p>

        {note ? (
          <p className="animate-fade-up rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/65">
            {note}
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-niki-ink/50">
          <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Built from the listing as it is priced right now. Every sale through this link is credited
          to you.
        </p>
      </div>
    </div>
  );
}
