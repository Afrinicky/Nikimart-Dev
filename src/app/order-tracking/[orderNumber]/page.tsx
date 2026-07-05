import type { Metadata } from "next";
import { AlertTriangle, Check, KeyRound, MapPin } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderLookup } from "@/components/global/OrderLookup";
import {
  getOrderByNumber,
  getPickupPointById,
  LANDED_COST_LABELS,
  ORDER_STAGES,
  stageIndex,
} from "@/lib/global-data";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

type Params = Promise<{ orderNumber: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Order ${decodeURIComponent(orderNumber)} — NikiMart` };
}

export default async function OrderTrackingDetailPage({ params }: { params: Params }) {
  const { orderNumber } = await params;
  const decoded = decodeURIComponent(orderNumber);
  const order = getOrderByNumber(decoded);

  if (!order) {
    return (
      <>
        <PageHeader
          title="Order not found"
          crumbs={[{ label: "Order tracking", href: "/order-tracking" }, { label: decoded }]}
        />
        <Container className="py-8">
          <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-8">
            <p className="flex items-center gap-2 text-sm text-niki-ink/70">
              <AlertTriangle className="h-5 w-5 text-niki-danger" />
              We couldn&apos;t find an order matching <strong className="font-semibold">{decoded}</strong>.
              Check the number and try again.
            </p>
            <div className="mt-5">
              <OrderLookup defaultValue={decoded} />
            </div>
          </div>
        </Container>
      </>
    );
  }

  const current = stageIndex(order.status);
  const pickup = getPickupPointById(order.pickupPointId);
  const isDisputed = order.status === "disputed";

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`${order.item} · from ${order.source}`}
        crumbs={[{ label: "Order tracking", href: "/order-tracking" }, { label: order.orderNumber }]}
      />

      <Container className="py-8">
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-7">
            <h2 className="font-display text-lg font-bold text-niki-ink">Status</h2>

            {order.status === "ready_for_pickup" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-niki-success/10 p-4 ring-1 ring-niki-success/20">
                <KeyRound className="h-5 w-5 text-niki-success" />
                <div>
                  <p className="text-sm font-semibold text-niki-ink">Ready for pickup</p>
                  <p className="text-sm text-niki-ink/60">
                    Show this one-time code to collect:{" "}
                    <span className="font-mono text-base font-bold tracking-widest text-niki-ink">
                      {order.pickupOtp}
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            <ol className="mt-6 space-y-5">
              {ORDER_STAGES.map((stage, i) => {
                const done = i < current;
                const active = i === current;
                return (
                  <li key={stage.key} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        done && "bg-niki-success text-white",
                        active && "bg-niki-orange text-white ring-4 ring-niki-orange/15",
                        !done && !active && "bg-niki-surface text-niki-ink/40 ring-1 ring-black/5",
                      )}
                    >
                      {done ? <Check className="h-4 w-4" /> : i + 1}
                    </span>
                    <div>
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          active ? "text-niki-ink" : done ? "text-niki-ink/80" : "text-niki-ink/45",
                        )}
                      >
                        {stage.label}
                      </p>
                      <p className="text-xs text-niki-ink/50">{stage.description}</p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {isDisputed ? (
              <p className="mt-6 flex items-center gap-2 rounded-2xl bg-niki-danger/10 p-4 text-sm text-niki-danger ring-1 ring-niki-danger/20">
                <AlertTriangle className="h-4 w-4" />
                This order is under dispute. Our support team is reviewing it.
              </p>
            ) : null}
          </div>

          <aside className="space-y-6">
            {pickup ? (
              <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5">
                <h3 className="flex items-center gap-2 font-semibold text-niki-ink">
                  <MapPin className="h-4 w-4 text-niki-orange" />
                  Pickup point
                </h3>
                <p className="mt-2 text-sm font-medium text-niki-ink">{pickup.name}</p>
                <p className="text-sm text-niki-ink/60">{pickup.region}</p>
                <p className="mt-1 text-sm text-niki-ink/60">{pickup.hours}</p>
              </div>
            ) : null}

            <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5">
              <h3 className="font-semibold text-niki-ink">Order summary</h3>
              <dl className="mt-3 space-y-2 text-sm">
                {LANDED_COST_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <dt className="text-niki-ink/60">{label}</dt>
                    <dd className="font-medium text-niki-ink">{formatPrice(order.cost[key])}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-black/5 pt-2">
                  <dt className="font-semibold text-niki-ink">Total paid</dt>
                  <dd className="font-display font-bold text-niki-orange">
                    {formatPrice(order.cost.total)}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-niki-ink/40">Placed on {order.placedOn}</p>
            </div>
          </aside>
        </div>
      </Container>
    </>
  );
}
