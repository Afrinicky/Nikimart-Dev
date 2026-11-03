import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Clock3, MessageCircle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ServicePayButton } from "@/components/data/ServicePayButton";
import { getServiceOrder } from "@/lib/data-bundles/service-orders";
import { getDataStoreConfig } from "@/lib/data-bundles/settings";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Pay for your application — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The payment link an admin or an agent sends a customer they registered.
 *
 * Everything else about that arrangement happened off the website: the
 * documents, the questions, the back and forth. This page is the one part
 * that has to come back through Nickimart, so it says exactly what is being
 * paid for and then opens the same Paystack checkout the website uses.
 *
 * The reference is the only key, and it buys nothing but the chance to settle
 * a bill that already exists — an order already paid is sent to its own page
 * instead.
 */
export default async function ServicePayPage({
  params,
}: {
  params: Promise<{ reference: string }>;
}) {
  const { reference } = await params;
  const order = await getServiceOrder(reference);
  if (!order) notFound();

  const orderHref = `/data-bundles/services/order/${encodeURIComponent(order.reference)}`;
  if (order.paymentStatus === "paid") redirect(orderHref);

  const store = await getDataStoreConfig();
  const closed = order.status === "cancelled" || order.status === "refunded";

  return (
    <>
      <PageHeader
        title={order.serviceName}
        subtitle={`Prepared for ${order.customerName}`}
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "Payment" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-md">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
            <dl className="rounded-2xl bg-niki-surface p-4 text-sm">
              <div className="flex items-center justify-between py-1">
                <dt className="text-niki-ink/55">Service</dt>
                <dd className="font-semibold text-niki-ink">{order.serviceName}</dd>
              </div>
              <div className="flex items-center justify-between py-1">
                <dt className="text-niki-ink/55">Option</dt>
                <dd className="font-semibold text-niki-ink">{order.variantName}</dd>
              </div>
              {order.speedLabel ? (
                <div className="flex items-center justify-between py-1">
                  <dt className="text-niki-ink/55">Speed</dt>
                  <dd className="font-semibold text-niki-ink">{order.speedLabel}</dd>
                </div>
              ) : null}
              {order.turnaround ? (
                <div className="flex items-center justify-between py-1">
                  <dt className="text-niki-ink/55">Turnaround</dt>
                  <dd className="flex items-center gap-1 font-semibold text-niki-ink">
                    <Clock3 className="h-3.5 w-3.5 text-niki-ink/35" />
                    {order.turnaround}
                  </dd>
                </div>
              ) : null}
              <div className="flex items-center justify-between border-t border-niki-edge pt-2">
                <dt className="text-niki-ink/55">Amount to pay</dt>
                <dd className="font-figures text-lg font-bold text-niki-orange">
                  {formatPrice(order.price)}
                </dd>
              </div>
            </dl>

            <p className="mt-3 font-mono text-[11px] text-niki-ink/40">{order.reference}</p>

            <div className="mt-5">
              {closed ? (
                <p className="rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/60">
                  This order is closed. Contact Nickimart with the reference above.
                </p>
              ) : (
                <ServicePayButton reference={order.reference} amount={order.price} />
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="text-sm text-niki-ink/60">Not expecting this? Check with us first.</p>
            {store.whatsapp ? (
              <a
                href={store.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-niki-ghana px-5 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : null}
          </div>

          <p className="mt-6 text-center text-xs text-niki-ink/40">
            Already paid?{" "}
            <Link href={orderHref} className="font-semibold text-niki-orange hover:underline">
              Open your application
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
