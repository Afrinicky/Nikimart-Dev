"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, MessageCircle, Share2 } from "lucide-react";
import {
  FLYER_HEIGHT,
  FLYER_WIDTH,
  PRODUCT_FLYER_THEMES,
  drawProductFlyer,
  flyerFileName,
  flyerTheme,
  productFlyerShareText,
  type FlyerImage,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import {
  recordAffiliateShare,
  savePromotedProduct,
  type ActionState,
} from "@/lib/affiliate-console-actions";
import { cn } from "@/lib/cn";

/**
 * The product flyer, live — the data-bundle flyer studio applied to retail.
 *
 * Deliberately the same motion agents already know: pick a colour, write a
 * line, press share. The canvas is the artwork itself at full resolution,
 * scaled down by CSS for the preview, so what goes out is exactly what is on
 * screen; the share sheet carries the image *as a file*, which is what puts it
 * in WhatsApp as a picture rather than a link somebody has to tap to see.
 *
 * The photograph is the one thing this has to cope with that the bundle flyer
 * did not. It is fetched with CORS so the canvas stays exportable; a host that
 * refuses leaves the listing's own gradient and emoji in its place, which is
 * the same placeholder the storefront shows. A flyer with a blank rectangle on
 * it is one nobody posts, and refusing to make one at all is worse.
 */
export function AffiliateFlyerStudio({
  /** The row on the affiliate's list, when it is on their list. */
  promotionId,
  data,
  imageUrl,
  /** The caption to start from: the product's, else the affiliate's, else the default. */
  initialMessage,
  initialTheme,
  /** The link, shown under the controls for copying on a desktop. */
  link,
}: {
  promotionId: string | null;
  data: Omit<ProductFlyerData, "message">;
  imageUrl: string | null;
  initialMessage: string;
  initialTheme: string;
  link: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState(() => flyerTheme(initialTheme));
  const [message, setMessage] = useState(initialMessage);
  // The photograph, once it has loaded, tagged with the URL it came from.
  // Keyed rather than reset so switching product never draws the last one's
  // picture, and so nothing has to be cleared from inside an effect.
  const [loaded, setLoaded] = useState<{ url: string; image: FlyerImage } | null>(null);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveState, save, saving] = useActionState<ActionState, FormData>(savePromotedProduct, {});

  // Only ever this product's picture: a stale one from the previous render
  // would be drawn onto the wrong flyer.
  const image = imageUrl && loaded?.url === imageUrl ? loaded.image : null;

  // Load the photograph cross-origin, so the export is not tainted.
  useEffect(() => {
    if (!imageUrl) return;
    let cancelled = false;
    const img = new Image();
    // A data: URL needs no CORS and setting it would break nothing; a remote
    // one does, or toBlob throws a SecurityError on export.
    if (!imageUrl.startsWith("data:")) img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!cancelled) {
        setLoaded({
          url: imageUrl,
          image: { source: img, width: img.naturalWidth, height: img.naturalHeight },
        });
      }
    };
    img.onerror = () => {
      // A host that will not serve it cross-origin, or a dead URL. Nothing is
      // recorded, so `image` stays null and the listing's own gradient and
      // emoji are drawn instead — the same placeholder the storefront shows.
    };
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  const flyer: ProductFlyerData = { ...data, message };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, FLYER_WIDTH, FLYER_HEIGHT);
    drawProductFlyer(ctx, flyer, theme, image);
    // `flyer` is rebuilt every render by design — the preview has to follow the
    // caption as it is typed — so the dependencies are its parts.
  }, [data, message, theme, image]); // eslint-disable-line react-hooks/exhaustive-deps

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) return resolve(null);
        try {
          canvas.toBlob((blob) => resolve(blob), "image/png");
        } catch {
          // A tainted canvas. Shouldn't happen — the image load above falls
          // back rather than drawing something it cannot export — but a flyer
          // that cannot be saved must say so instead of throwing.
          resolve(null);
        }
      }),
    [],
  );

  const fileName = flyerFileName(data.name);
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

  async function download() {
    setBusy("download");
    setNote(null);
    const blob = await toBlob();
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
    const blob = await toBlob();

    if (blob && typeof navigator !== "undefined" && "canShare" in navigator) {
      const file = new File([blob], fileName, { type: "image/png" });
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
    setNote("Flyer saved — attach it to the WhatsApp message that just opened.");
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
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl ring-1 ring-niki-edge">
        <canvas
          ref={canvasRef}
          width={FLYER_WIDTH}
          height={FLYER_HEIGHT}
          className="block h-auto w-full bg-white"
          aria-label={`${data.name} flyer`}
          role="img"
        />
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
            Goes on the flyer and in the WhatsApp message. Use{" "}
            <code className="font-mono">{"{product}"}</code>,{" "}
            <code className="font-mono">{"{price}"}</code> or{" "}
            <code className="font-mono">{"{link}"}</code> and they&apos;ll be filled in.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">Colour</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {PRODUCT_FLYER_THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTheme(t)}
                aria-pressed={t.key === theme.key}
                className={cn(
                  "niki-press niki-focus rounded-xl px-2 py-2.5 text-xs font-semibold ring-1 transition-colors",
                  t.key === theme.key
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
            <input type="hidden" name="flyerTheme" value={theme.key} />
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

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
