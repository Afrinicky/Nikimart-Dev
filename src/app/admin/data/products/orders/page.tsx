import type { Metadata } from "next";
import { Inbox, Search, UserPlus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ServiceModuleHeader } from "@/components/admin/ServiceModuleHeader";
import { ServiceOrderRow } from "@/components/admin/ServiceOrderRow";
import { ServiceAssistForm } from "@/components/data/ServiceAssistForm";
import { inputBase, inputClass } from "@/components/ui/Field";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getAdminServiceOrders, SERVICE_STATUSES, SERVICE_STATUS_LABELS } from "@/lib/data-bundles/service-orders";
import { getHouseCatalogue } from "@/lib/data-bundles/services";
import { openSpeeds } from "@/lib/data-bundles/service-fields";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Service orders — Admin — Nickimart" };
export const dynamic = "force-dynamic";

const WHEN: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
};

/**
 * Everything that has been ordered, and the counter form for everything that
 * has not been ordered on the website.
 *
 * The queue is the page. The registration form sits above it because that is
 * the order the work happens in: somebody walks in, you create the order, you
 * send them the link, and from then on it is a row in the list like any other.
 */
export default async function AdminServiceOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  await requireDataAdmin();
  const params = (await searchParams) ?? {};

  const [{ rows, total }, shelf] = await Promise.all([
    getAdminServiceOrders({ query: params.q, status: params.status, take: 50 }),
    getHouseCatalogue(),
  ]);

  return (
    <Container className="py-8">
      <ServiceModuleHeader />

      <section className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="lg:order-2">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
                <UserPlus className="h-4.5 w-4.5" />
              </span>
              <div>
                <h2 className="font-display font-bold text-niki-ink">Register a customer</h2>
                <p className="text-xs text-niki-ink/55">
                  For someone who brought their documents to you. Ends in a payment link.
                </p>
              </div>
            </div>
            <ServiceAssistForm
              services={shelf.map((s) => ({
                slug: s.slug,
                name: s.name,
                variants: s.variants.map((v) => ({
                  id: v.id,
                  name: v.name,
                  price: v.sellPrice,
                  turnaround: v.turnaround,
                  standardEnabled: v.standardEnabled,
                  speeds: openSpeeds(v.speeds),
                })),
              }))}
            />
          </div>
        </div>

        <div className="lg:order-1">
          <PanelHeading
            title="Orders"
            subtitle={`${total} ${total === 1 ? "application" : "applications"}`}
          />

          <form method="get" className="mb-4 flex flex-wrap gap-2">
            <label className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Reference, name or phone"
                className={cn(inputClass, "pl-9")}
              />
            </label>
            <select name="status" defaultValue={params.status ?? ""} className={cn(inputBase, "w-44")}>
              <option value="">Every status</option>
              {SERVICE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {SERVICE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-xl bg-niki-black px-5 py-2.5 text-sm font-semibold text-white"
            >
              Filter
            </button>
          </form>

          {rows.length === 0 ? (
            <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-niki-edge">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/40">
                <Inbox className="h-5 w-5" />
              </span>
              <p className="mt-3 font-display font-bold text-niki-ink">Nothing here</p>
              <p className="mt-1 text-sm text-niki-ink/60">
                No applications match what you asked for.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((o) => (
                <ServiceOrderRow
                  key={o.id}
                  order={{
                    id: o.id,
                    reference: o.reference,
                    serviceName: o.serviceName,
                    variantName: o.variantName,
                    speedLabel: o.speedLabel,
                    turnaround: o.turnaround,
                    price: o.price,
                    customerName: o.customerName,
                    customerPhone: o.customerPhone,
                    customerEmail: o.customerEmail,
                    status: o.status,
                    paymentStatus: o.paymentStatus,
                    adminNote: o.adminNote,
                    source: o.source,
                    agentName: o.agentName,
                    agentCommission: o.agentCommission,
                    commissionStatus: o.commissionStatus,
                    createdAt: o.createdAt.toLocaleString("en-GH", WHEN),
                    answers: o.answers,
                    documents: o.documents,
                  }}
                />
              ))}
            </ul>
          )}

          <p className="mt-4 text-xs text-niki-ink/45">
            Marking an order completed is what credits the selling agent&apos;s commission: the
            money is owed when the work is done, not when it was paid for.
          </p>
        </div>
      </section>
    </Container>
  );
}
