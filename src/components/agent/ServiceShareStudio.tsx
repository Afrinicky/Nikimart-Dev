"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Loader2, Share2 } from "lucide-react";
import {
  FLYER_HEIGHT,
  FLYER_WIDTH,
  PRODUCT_FLYER_THEMES,
  drawProductFlyer,
  flyerFileName,
  type FlyerDesign,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import { useShareImage } from "@/components/affiliate/share-canvas";
import { saveAgentServiceFlyerTheme } from "@/lib/data-bundles/service-agent-actions";
import { inputClass } from "@/components/ui/Field";
import { cn } from "@/lib/cn";

/**
 * The share studio for one service.
 *
 * The bundle flyer's motion, which agents already know: pick a look, write a
 * line, press share. The canvas is the artwork itself at full resolution,
 * scaled down by CSS for the preview, so what goes out is exactly what is on
 * screen — and the share sheet carries the image *as a file*, which is what
 * puts it into WhatsApp as a picture rather than a link somebody has to tap.
 *
 * The flyer is drawn from the service as it is priced right now, so nothing is
 * stored as an image and a price change never leaves an old one in
 * circulation.
 */
export function ServiceShareStudio({
  data,
  imageUrl,
  design,
  link,
  initialMessage,
}: {
  data: Omit<ProductFlyerData, "message">;
  imageUrl: string | null;
  design: FlyerDesign;
  link: string;
  initialMessage: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [theme, setTheme] = useState(design.theme);
  const [message, setMessage] = useState(initialMessage);
  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const image = useShareImage(imageUrl);
  const activeDesign: FlyerDesign = { ...design, theme };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = FLYER_WIDTH;
    canvas.height = FLYER_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, FLYER_WIDTH, FLYER_HEIGHT);
    drawProductFlyer(ctx, { data: { ...data, message }, design: activeDesign, image });
    // The preview follows the caption as it is typed, so the dependencies are
    // the parts rather than the object rebuilt on every render.
  }, [data, message, theme, image, design]); // eslint-disable-line react-hooks/exhaustive-deps

  const shareText = `${message.trim() || data.name}\n\nApply online: ${link}`;
  const fileName = flyerFileName(data.name);

  function rememberTheme(next: string) {
    setTheme(next);
    const fd = new FormData();
    fd.set("theme", next);
    void saveAgentServiceFlyerTheme(fd).catch(() => {});
  }

  function currentBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current;
    if (!canvas) return Promise.resolve(null);
    return new Promise((resolve) => {
      try {
        canvas.toBlob((blob) => resolve(blob), "image/png");
      } catch {
        resolve(null);
      }
    });
  }

  async function download() {
    setBusy("download");
    setNote(null);
    const blob = await currentBlob();
    setBusy(null);
    if (!blob) return setNote("Couldn't build the image. Please try again.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function share() {
    setBusy("share");
    setNote(null);
    const blob = await currentBlob();
    if (!blob) {
      setBusy(null);
      return setNote("Couldn't build the image. Please try again.");
    }

    const file = new File([blob], fileName, { type: "image/png" });
    // The picture has to go as a file, or WhatsApp receives a link instead of
    // an image. Where the device won't take files, the flyer is saved and the
    // caption copied — the same two things, by hand.
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
        setBusy(null);
        return;
      }
    } catch {
      setBusy(null);
      return; // the sheet was dismissed; that is not an error
    }

    setBusy(null);
    await download();
    try {
      await navigator.clipboard.writeText(shareText);
      setNote("Flyer saved and the caption copied — paste it with the picture.");
    } catch {
      setNote("Flyer saved. Copy the caption below to go with it.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setNote("Copy the link below by hand.");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* The flyer itself, at full resolution, scaled by CSS. */}
      <div>
        <canvas
          ref={canvasRef}
          className="w-full rounded-2xl shadow-lg ring-1 ring-niki-edge"
          style={{ aspectRatio: `${FLYER_WIDTH} / ${FLYER_HEIGHT}` }}
        />
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-niki-ink">Colourway</p>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_FLYER_THEMES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => rememberTheme(t.key)}
                aria-pressed={theme === t.key}
                className={cn(
                  "niki-press rounded-full px-4 py-2 text-xs font-bold ring-1",
                  theme === t.key
                    ? "bg-niki-black text-white ring-niki-black"
                    : "bg-white text-niki-ink/60 ring-niki-edge-strong hover:text-niki-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">Your message</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className={inputClass}
          />
          <span className="mt-1 block text-xs text-niki-ink/50">
            Goes on the flyer and in the caption.
          </span>
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={share}
            disabled={busy !== null}
            className="niki-press flex flex-1 items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light disabled:opacity-60"
          >
            {busy === "share" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Share2 className="h-4 w-4" />
            )}
            Share
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy !== null}
            className="niki-press flex items-center justify-center gap-2 rounded-xl bg-niki-surface px-4 py-3 text-sm font-bold text-niki-ink/70 hover:bg-niki-black/5 disabled:opacity-60"
          >
            {busy === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Save
          </button>
        </div>

        {note ? (
          <p className="animate-fade-up rounded-xl bg-niki-surface px-4 py-2.5 text-xs text-niki-ink/65">
            {note}
          </p>
        ) : null}

        <div>
          <p className="mb-1.5 text-sm font-medium text-niki-ink">Your link</p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-niki-surface px-4 py-2.5 font-mono text-xs text-niki-ink/70">
              {link}
            </code>
            <button
              type="button"
              onClick={copyLink}
              className="niki-press flex items-center gap-1.5 rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-xs text-niki-ink/50">
            Applications off this link are priced from your ladder and credited to you.
          </p>
        </div>
      </div>
    </div>
  );
}
