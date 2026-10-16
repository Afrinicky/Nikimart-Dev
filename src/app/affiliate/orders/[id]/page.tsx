import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, MapPin, Package, Truck } from "lucide-react";
import { ConsolePill, formatWhen } from "@/components/affiliate/ConsoleTable";
import { TrackingTimeline } from "@/components/order/TrackingTimeline";
import { MessageThread } from "@/components/affiliate/MessageThread";
import { ContactCustomerForm } from "@/components/affiliate/ContactCustomerForm";
import { EscalateForm } from "@/components/affiliate/EscalateForm";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAssistOrder, getThread } from "@/lib/affiliate-assist";
import { markThreadRead } from "@/lib/affiliate-assist-actions";
import { COMMISSION_STATUS_LABELS } from "@/lib/affiliate-ledger";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Referred order — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One referred order, and the job attached to it.
 *
 * The parcel's progress is the same timeline the buyer is looking at, from the
 * same confirmations — which is the point: an affiliate relaying "it is out for
 * delivery" has to be reading what the buyer reads, or they are inventing.
 *
 * The bill is not here. Not the delivery fee, not the total, not what has been
 * paid or what is still owed, not the address. What an affiliate needs to chase
 * a delivery is which Nickimart point it is going to and what is in the box.
 */
export default async function AffiliateOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const { id } = await params;

  const order = await getAssistOrder(affiliate.id, id);
  if (!order) notFound();

  const thread = order.threadId
    ? await getThread(order.threadId, { role: "affiliate", affiliateId: affiliate.id })
    : null;
  if (thread) await markThreadRead(thread.id);

  const method = order.deliveryMethod === "pickup" ? "pickup" : "delivery";

  return (
    <div>
      <Link
        href="/affiliate/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        All referred orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">{order.orderNumber}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-niki-ink/55">
            <Link
              href={`/affiliate/customers/${order.customerId}`}
              className="font-semibold text-niki-ink/75 hover:text-niki-orange"
            >
              {order.buyer}
            </Link>
            <span>·</span>
            <span>{formatWhen(order.createdAt)}</span>
            <span>·</span>
            <span>
              {order.itemCount} item{order.itemCount === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConsolePill status={order.status} label={order.stageLabel} />
          <ConsolePill
            status={order.commissionStatus}
            label={`${formatMoney(order.commission)} · ${COMMISSION_STATUS_LABELS[order.commissionStatus] ?? order.commissionStatus}`}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-bold text-niki-ink">Where it is</h2>
              {order.trackingNumber ? (
                <span className="font-mono text-xs text-niki-ink/45">{order.trackingNumber}</span>
              ) : null}
            </div>

            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-niki-ink/60">
              {method === "pickup" ? (
                <MapPin className="h-4 w-4 text-niki-orange" />
              ) : (
                <Truck className="h-4 w-4 text-niki-orange" />
              )}
              {order.destination}
              {order.eta ? (
                <span className="text-niki-ink/40">· due {formatWhen(order.eta)}</span>
              ) : null}
            </p>

            <div className="mt-5">
              <TrackingTimeline
                timestamps={order.timestamps}
                method={method}
                route={order.route}
              />
            </div>

            <p className="mt-2 text-xs text-niki-ink/45">
              The same steps your customer sees. Tell them what is here and nothing more — if you
              need to know why a step is late, ask Nickimart.
            </p>
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
              <Package className="h-4 w-4 text-niki-orange" />
              What they bought
            </h2>
            <ul className="mt-3 divide-y divide-niki-edge">
              {order.items.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-niki-surface text-lg">
                    {i.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span aria-hidden>{i.emoji}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/affiliate/shop/${i.slug}`}
                      className="block truncate font-semibold text-niki-ink hover:text-niki-orange"
                    >
                      {i.name}
                    </Link>
                    <p className="text-xs text-niki-ink/45">
                      {i.shopName} · qty {i.quantity}
                      {i.earning ? "" : " · no commission on this line"}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-niki-ink/80">
                    {formatPrice(i.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-center justify-between border-t border-niki-edge pt-3 text-sm">
              <span className="text-niki-ink/55">Goods</span>
              <span className="font-figures font-bold text-niki-ink">
                {formatPrice(order.subtotal)}
              </span>
            </p>
          </section>

          <section>
            <h2 className="mb-3 font-display text-lg font-bold text-niki-ink">
              {thread ? `Your conversation with ${order.buyer}` : `Talk to ${order.buyer}`}
            </h2>
            {thread ? (
              <MessageThread
                threadId={thread.id}
                kind={thread.kind}
                role="affiliate"
                resolved={thread.status === "resolved"}
                resolution={thread.resolution}
                allowInternal
                disabled={affiliate.status === "suspended"}
                disabledNote="Your affiliate account is on hold, so you can't send messages."
                messages={thread.messages.map((m) => ({
                  ...m,
                  createdAt: m.createdAt.toISOString(),
                }))}
              />
            ) : order.customerId ? (
              <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <p className="mb-3 text-sm text-niki-ink/60">
                  Nothing said yet. A buyer who knows a person is looking after their order asks
                  you rather than giving up — and comes back for the next one.
                </p>
                <ContactCustomerForm
                  customerId={order.customerId}
                  orderId={order.id}
                  orderNumber={order.orderNumber}
                  customerName={order.buyer}
                  defaultTopic="delivery"
                  suspended={affiliate.status !== "active"}
                />
              </div>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
            <h2 className="font-display text-sm font-bold text-niki-ink">
              Need an answer from Nickimart?
            </h2>
            <p className="mt-1 mb-3 text-xs text-niki-ink/55">
              Stock, a delay, a return — ask, and pass the answer on marked as confirmed.
            </p>
            <EscalateForm
              orderId={order.id}
              orderNumber={order.orderNumber}
              defaultSubject={`${order.orderNumber} — ${order.stageLabel}`}
              defaultTopic="delivery"
            />
          </div>

          <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
            <h2 className="font-display text-sm font-bold text-niki-ink">Your commission</h2>
            <p className="mt-1 font-figures text-2xl font-bold text-niki-ink">
              {formatMoney(order.commission)}
            </p>
            <p className="mt-1 text-xs text-niki-ink/55">
              {COMMISSION_STATUS_LABELS[order.commissionStatus] ?? order.commissionStatus}
            </p>
            <Link
              href="/affiliate/commissions"
              className="mt-3 inline-block text-xs font-semibold text-niki-orange hover:underline"
            >
              See the ledger
            </Link>
          </div>

          <div className="rounded-2xl bg-niki-surface p-4 ring-1 ring-niki-edge">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-niki-ink">
              <Lock className="h-4 w-4 text-niki-ink/50" />
              Not shown to you
            </h2>
            <p className="mt-1.5 text-xs text-niki-ink/55">
              What was charged, how it was paid, anything still owed, and the delivery address. You
              have what you need to help; the rest is between the buyer and Nickimart.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
