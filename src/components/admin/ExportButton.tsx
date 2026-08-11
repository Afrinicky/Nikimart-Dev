import { FileSpreadsheet } from "lucide-react";
import type { ExportDataset } from "@/lib/exports";

/**
 * Downloads the Excel workbook for a console tab. A plain anchor rather than a
 * fetch: the browser handles the Content-Disposition download itself, so there
 * is no client JavaScript involved and it works with the keyboard and on mobile.
 */
export function ExportButton({
  dataset,
  label = "Export to Excel",
}: {
  dataset: ExportDataset;
  label?: string;
}) {
  return (
    <a
      href={`/admin/export/${dataset}`}
      download
      className="flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 transition-colors hover:bg-white"
    >
      <FileSpreadsheet className="h-4 w-4 text-niki-success" />
      {label}
    </a>
  );
}
