"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, MessageCircle, Share2 } from "lucide-react";
import {
  FLYER_HEIGHT,
  FLYER_THEMES,
  FLYER_WIDTH,
  drawFlyer,
  flyerShareText,
  type FlyerData,
} from "@/lib/data-bundles/flyer";
import { cn } from "@/lib/cn";

/**
 * The flyer, live.
 *
 * Everything on it comes from the store as it is priced right now, so there is
 * nothing to fill in and nothing to get out of date: pick a colour, send it.
 * The canvas is the artwork itself at full resolution, scaled down by CSS for
 * the preview, so what is shared is exactly what is on screen.
 */
export function FlyerStudio({ data }: { data: FlyerData }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState(FLYER_THEMES[0]);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, FLYER_WIDTH, FLYER_HEIGHT);
    drawFlyer(ctx, data, theme);
  }, [data, theme]);

  const toBlob = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas) return resolve(null);
        canvas.toBlob((blob) => resolve(blob), "image/png");
      }),
    [],
  );

  const fileName = `${data.storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-data-prices.png`;

  async function download() {
    setBusy("download");
    setNote(null);
    const blob = await toBlob();
    setBusy(null);
    if (!blob) return setNote("Couldn't build the image. Please try again.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
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
    const text = flyerShareText(data);
    const blob = await toBlob();

    if (blob && typeof navigator !== "undefined" && "canShare" in navigator) {
      const file = new File([blob], fileName, { type: "image/png" });
      const payload = { files: [file], text, title: `${data.storeName} — data prices` };
      if (navigator.canShare?.(payload)) {
        try {
          await navigator.share(payload);
          setBusy(null);
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

    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    setBusy(null);
    setNote("Flyer saved — attach it to the WhatsApp message that just opened.");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl ring-1 ring-niki-edge">
        <canvas
          ref={canvasRef}
          width={FLYER_WIDTH}
          height={FLYER_HEIGHT}
          className="block h-auto w-full"
          aria-label={`${data.storeName} data price flyer`}
          role="img"
        />
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">Colour</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {FLYER_THEMES.map((t) => (
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
          <button
            type="button"
            onClick={download}
            disabled={busy !== null}
            className="niki-press niki-focus flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5 disabled:opacity-60"
          >
            {busy === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download image
          </button>
        </div>

        {note ? (
          <p className="animate-fade-up rounded-xl bg-niki-surface px-4 py-3 text-xs text-niki-ink/65">
            {note}
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-xs leading-relaxed text-niki-ink/50">
          <Share2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Built from the prices your store is selling at right now. Change a price and the flyer
          changes with it — your store link is printed on every copy.
        </p>
      </div>
    </div>
  );
}
