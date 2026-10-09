import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileSpreadsheet, FileText, Info } from "lucide-react";
import { requireAdmin } from "@/lib/session";
import { DATA_EXPORT_LIST } from "@/lib/data-bundles/exports";

export const metadata: Metadata = { title: "Export — Data Store Settings — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Business data out of the Data Bundles database, as spreadsheets.
 *
 * Deliberately not the Backups tab. A backup is for putting the database back
 * and is useless to a bookkeeper; an export answers a question — what did we
 * pay in commission, who is owed a withdrawal, what did AFA bring in — and is
 * useless for a restore. Keeping them apart is what stops somebody reaching
 * for the wrong one on the day it matters, which is the whole reason the brief
 * asked for the separation.
 *
 * Plain anchors rather than buttons: the browser handles the download itself,
 * so there is no client JavaScript involved and it works with the keyboard and
 * on a phone. Same as the retail console's export.
 */
export default async function DataExportPage() {
  const admin = await requireAdmin().catch(() => null);
  if (!admin) redirect("/admin");

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm text-niki-ink/60">
        Spreadsheets of the bundle business for accounting and reporting. Each one is built when
        you press it, from the live database, so the figures are what the console is showing right
        now. Excel keeps every sheet; CSV holds one sheet at a time and is the one to feed to
        another system.
      </p>

      <p className="flex max-w-3xl items-start gap-2 rounded-xl bg-niki-surface/70 px-4 py-3 text-sm text-niki-ink/70">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-niki-ink/40" />
        <span>
          These carry agent contact details, mobile money accounts and the full commission ledger.
          They are not a backup — for that, and for restoring, use the{" "}
          <span className="font-semibold">Backups</span> tab.
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {DATA_EXPORT_LIST.map((info) => (
          <section
            key={info.dataset}
            className="flex flex-col rounded-2xl bg-white p-5 ring-1 ring-niki-edge"
          >
            <h2 className="font-display text-base font-bold text-niki-ink">{info.title}</h2>
            <p className="mt-1 flex-1 text-sm leading-snug text-niki-ink/60">
              {info.description}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <a
                href={`/admin/data/settings/export/${info.dataset}`}
                className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-niki-ink/75 ring-1 ring-niki-edge-strong transition-colors hover:bg-niki-surface"
              >
                <FileSpreadsheet className="h-4 w-4 text-niki-success" />
                Excel
              </a>
              {/* One CSV link per sheet, because a CSV cannot hold two. */}
              {info.sheets.map((sheet) => (
                <a
                  key={sheet}
                  href={`/admin/data/settings/export/${info.dataset}?format=csv&sheet=${encodeURIComponent(sheet)}`}
                  className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold text-niki-ink/60 ring-1 ring-niki-edge-control transition-colors hover:bg-niki-surface"
                >
                  <FileText className="h-3.5 w-3.5" />
                  {info.sheets.length > 1 ? `CSV — ${sheet}` : "CSV"}
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
