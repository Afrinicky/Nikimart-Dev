"use client";

import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Link2, Star, Trash2, Upload } from "lucide-react";
import { inputClass } from "@/components/ui/Field";

const MAX_DIM = 1200; // downscale uploads so data URLs stay reasonably small

// Resize an image file client-side and return a JPEG/PNG data URL.
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          const scale = MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(String(reader.result));
        ctx.drawImage(img, 0, 0, width, height);
        const type = file.type === "image/png" ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(type, 0.82));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ProductImagesField({ initial = [] }: { initial?: string[] }) {
  const [urls, setUrls] = useState<string[]>(initial);
  const [urlInput, setUrlInput] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const move = (i: number, dir: -1 | 1) =>
    setUrls((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const addUrl = () => {
    const v = urlInput.trim();
    if (v) {
      setUrls((prev) => [...prev, v]);
      setUrlInput("");
    }
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        added.push(await fileToDataUrl(file));
      }
      setUrls((prev) => [...prev, ...added]);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-niki-ink">Product images</label>

      {urls.length > 0 ? (
        <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {urls.map((url, i) => (
            <div key={`${url.slice(0, 24)}-${i}`} className="group relative overflow-hidden rounded-xl ring-1 ring-black/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Image ${i + 1}`} className="aspect-square w-full object-cover" />
              {i === 0 ? (
                <span className="absolute left-1 top-1 flex items-center gap-1 rounded-full bg-niki-orange px-1.5 py-0.5 text-[9px] font-bold text-white">
                  <Star className="h-2.5 w-2.5" /> Primary
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/50 px-1 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-white disabled:opacity-30" title="Move left">
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setUrls((prev) => prev.filter((_, k) => k !== i))} className="rounded p-0.5 text-white hover:text-niki-danger" title="Remove">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === urls.length - 1} className="rounded p-0.5 text-white disabled:opacity-30" title="Move right">
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mb-3 rounded-xl bg-niki-surface p-3 text-xs text-niki-ink/50 ring-1 ring-black/5">
          No images yet. Upload from your device or add an image URL. The first image is the primary
          one shown on cards.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-2 rounded-full bg-niki-navy px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-niki-navy-light disabled:opacity-60"
        >
          <Upload className="h-3.5 w-3.5" />
          {busy ? "Processing…" : "Upload from device"}
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />

        <div className="flex flex-1 items-center gap-2">
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
            placeholder="…or paste an image URL"
            className={`${inputClass} py-2 text-sm`}
          />
          <button type="button" onClick={addUrl} className="flex items-center gap-1 rounded-full bg-niki-surface px-3 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-black/5 hover:bg-niki-navy/5">
            <Link2 className="h-3.5 w-3.5" />
            Add
          </button>
        </div>
      </div>

      <input type="hidden" name="images" value={JSON.stringify(urls)} />
    </div>
  );
}
