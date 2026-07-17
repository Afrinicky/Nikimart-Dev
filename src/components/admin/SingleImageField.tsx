"use client";

import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import { inputClass } from "@/components/ui/Field";

const MAX_DIM = 1200;

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
        resolve(canvas.toDataURL(type, 0.85));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * A single-image picker (device upload → data URL, or paste a URL) that submits
 * its value in a hidden input named `name`. Reused for banner artwork and the
 * brand logo.
 */
export function SingleImageField({
  name,
  label,
  initial = "",
  hint,
  previewClass = "h-24 w-40",
}: {
  name: string;
  label: string;
  initial?: string;
  hint?: string;
  previewClass?: string;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    setBusy(true);
    try {
      setValue(await fileToDataUrl(file));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-niki-ink">{label}</label>
      {hint ? <p className="mb-2 text-xs text-niki-ink/50">{hint}</p> : null}

      {value ? (
        <div className="mb-3 flex items-center gap-3">
          <div className={`overflow-hidden rounded-xl bg-niki-surface ring-1 ring-black/10 ${previewClass}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="Preview" className="h-full w-full object-contain" />
          </div>
          <button
            type="button"
            onClick={() => setValue("")}
            className="flex items-center gap-1.5 rounded-full bg-niki-surface px-3 py-1.5 text-xs font-semibold text-niki-ink/70 ring-1 ring-black/5 hover:text-niki-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      ) : null}

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
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFiles(e.target.files)} />
        <input
          value={value.startsWith("data:") ? "" : value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="…or paste an image URL"
          className={`${inputClass} flex-1 py-2 text-sm`}
        />
      </div>

      <input type="hidden" name={name} value={value} />
    </div>
  );
}
