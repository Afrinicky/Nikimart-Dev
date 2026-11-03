import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ServiceModuleHeader } from "@/components/admin/ServiceModuleHeader";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getServiceDocuments } from "@/lib/data-bundles/service-orders";
import { deleteServiceDocument } from "@/lib/data-bundles/service-admin-actions";
import { getServicesConfig } from "@/lib/data-bundles/settings";

export const metadata: Metadata = { title: "Service documents — Admin — Nickimart" };
export const dynamic = "force-dynamic";

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Everything customers have sent in, in one place.
 *
 * Each order shows its own documents, which is where they are usually read.
 * This is the other question: what is Nickimart holding, and how much of it —
 * because these are the only rows in the business measured in megabytes, and
 * the paperwork of a job finished a year ago is worth deleting.
 *
 * Nothing on this page carries the files themselves. Each row is a name and a
 * size; the bytes are fetched one at a time from the download route.
 */
export default async function AdminServiceDocumentsPage() {
  await requireDataAdmin();
  const [{ rows, total }, config] = await Promise.all([
    getServiceDocuments(100),
    getServicesConfig(),
  ]);

  const held = rows.reduce((sum, r) => sum + r.size, 0);
  const cap = (config.maxUploadBytes / 1_000_000).toFixed(1).replace(/\.0$/, "");

  return (
    <Container className="py-8">
      <ServiceModuleHeader />

      <section className="mt-6">
        <PanelHeading
          title="Documents"
          subtitle={`${total} on file${
            rows.length > 0 ? ` · ${sizeLabel(held)} across the ${rows.length} newest` : ""
          } · ${cap}MB limit per file`}
        />

        {rows.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-niki-edge">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/40">
              <FileText className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">Nothing on file</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/60">
              Customers attach their documents once an order is paid for. Nothing is stored before
              then.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead>
                  <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                    <th className="px-5 py-3 font-semibold">Document</th>
                    <th className="px-5 py-3 font-semibold">Order</th>
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Size</th>
                    <th className="px-5 py-3 font-semibold">Received</th>
                    <th className="px-5 py-3 font-semibold" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-niki-edge">
                  {rows.map((d) => (
                    <tr key={d.id} className="transition-colors hover:bg-niki-surface/60">
                      <td className="px-5 py-3">
                        <span className="font-semibold text-niki-ink">{d.label}</span>
                        <span className="block truncate text-[11px] text-niki-ink/45">
                          {d.fileName}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/data/products/orders?q=${encodeURIComponent(
                            d.order.reference,
                          )}`}
                          className="font-mono text-xs text-niki-ink/70 hover:text-niki-orange"
                        >
                          {d.order.reference}
                        </Link>
                        <span className="block truncate text-[11px] text-niki-ink/45">
                          {d.order.serviceName}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-niki-ink/70">{d.order.customerName}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-niki-ink/60">
                        {sizeLabel(d.size)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-xs text-niki-ink/55">
                        {d.createdAt.toLocaleDateString("en-GH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1.5">
                          <a
                            href={`/admin/data/products/documents/${d.id}`}
                            download
                            aria-label={`Download ${d.label}`}
                            className="niki-press rounded-lg bg-niki-black px-3 py-1.5 text-xs font-semibold text-white"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          <form action={deleteServiceDocument}>
                            <input type="hidden" name="id" value={d.id} />
                            <button
                              type="submit"
                              aria-label={`Delete ${d.label}`}
                              className="niki-press rounded-lg bg-niki-surface p-2 text-niki-ink/40 hover:bg-niki-danger/10 hover:text-niki-danger"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </Container>
  );
}
