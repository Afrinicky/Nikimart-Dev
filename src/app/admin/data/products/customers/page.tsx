import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle, Users } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ServiceModuleHeader } from "@/components/admin/ServiceModuleHeader";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getServiceCustomers } from "@/lib/data-bundles/service-orders";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Service customers — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Who has bought what.
 *
 * There is no customer table — the store sells to guests — so a customer here
 * is what the orders say they are: a phone number, the most recent name given
 * with it, and everything bought under it. That is enough to recognise someone
 * coming back and to reach them, which is all this list is for.
 */
export default async function AdminServiceCustomersPage() {
  await requireDataAdmin();
  const customers = await getServiceCustomers(100);

  return (
    <Container className="py-8">
      <ServiceModuleHeader />

      <section className="mt-6">
        <PanelHeading
          title="Customers"
          subtitle={`${customers.length} ${
            customers.length === 1 ? "person has" : "people have"
          } applied for something`}
        />

        {customers.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-niki-edge">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/40">
              <Users className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">No customers yet</p>
            <p className="mt-1 text-sm text-niki-ink/60">
              They appear here as soon as the first application comes in.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                    <th className="px-5 py-3 font-semibold">Customer</th>
                    <th className="px-5 py-3 font-semibold">Applications</th>
                    <th className="px-5 py-3 font-semibold">Paid</th>
                    <th className="px-5 py-3 font-semibold">Spend</th>
                    <th className="px-5 py-3 font-semibold">Last seen</th>
                    <th className="px-5 py-3 font-semibold">Reach them</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-niki-edge">
                  {customers.map((c) => (
                    <tr key={c.phone} className="transition-colors hover:bg-niki-surface/60">
                      <td className="px-5 py-3">
                        <Link
                          href={`/admin/data/products/orders?q=${encodeURIComponent(c.phone)}`}
                          className="font-semibold text-niki-ink hover:text-niki-orange"
                        >
                          {c.name || "—"}
                        </Link>
                        <span className="block font-mono text-[11px] text-niki-ink/45">
                          {c.phone}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-figures font-semibold text-niki-ink">
                        {c.orders}
                      </td>
                      <td className="px-5 py-3 text-niki-ink/70">{c.paidOrders}</td>
                      <td className="px-5 py-3 font-figures font-semibold text-niki-ink">
                        {formatPrice(c.spend)}
                      </td>
                      <td className="px-5 py-3 whitespace-nowrap text-xs text-niki-ink/55">
                        {c.lastOrderAt.toLocaleDateString("en-GH", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1.5">
                          <a
                            href={`https://wa.me/${c.phone.replace(/\D/g, "").replace(/^0/, "233")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`WhatsApp ${c.name || c.phone}`}
                            className="niki-press rounded-lg bg-niki-ghana/10 p-2 text-niki-ghana hover:bg-niki-ghana/20"
                          >
                            <MessageCircle className="h-4 w-4" />
                          </a>
                          {c.email ? (
                            <a
                              href={`mailto:${c.email}`}
                              aria-label={`Email ${c.name || c.phone}`}
                              className="niki-press rounded-lg bg-niki-surface p-2 text-niki-ink/60 hover:bg-niki-black/5"
                            >
                              <Mail className="h-4 w-4" />
                            </a>
                          ) : null}
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
