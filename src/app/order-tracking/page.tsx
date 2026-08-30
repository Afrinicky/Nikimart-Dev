import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { AlertTriangle, MapPin, PackageSearch, Truck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderLookup } from "@/components/global/OrderLookup";
import { TrackingTimeline } from "@/components/order/TrackingTimeline";
import { prisma } from "@/lib/prisma";
import { classifyOrderQuery } from "@/lib/order-query";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { formatPrice } from "@/lib/format";
import type { ShipmentRoute, ShipmentTimestamps } from "@/lib/tracking";

export const metadata: Metadata = {
  title: "Track an Order — Nickimart",
};

export const dynamic = "force-dynamic";

/**
 * The one front door for tracking anything bought here.
 *
 * It used to search a hardcoded array of four demo orders in lib/global-data,
 * so every real customer — marketplace or data bundle — was told their order
 * did not exist. There are genuinely two order tables behind this box, and
 * which one a query belongs to is decided by lib/order-query: references and
 * phone numbers go to the bundle tracker, which already knows how to show
 * them; everything else is looked up here as a marketplace order number.
 *
 * No sign-in, because the people who most need this are guests and buyers on a
 * borrowed phone. That is safe only because it stays narrow: the order number
 * carries ~60 bits of entropy (see order-actions), the lookup is rate-limited
 * per address, and the page shows the progress of the order and nothing that
 * would matter if guessed — no address, no phone, no contact details.
 */
export default async function OrderTrackingPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const route = classifyOrderQuery(q);

  // References, AFA numbers and phone numbers belong to the bundle store, which
  // has a tracker built for them.
  if (route.kind === "data") {
    redirect(`/data-bundles/orders?q=${encodeURIComponent(route.query)}`);
  }

  let order: Awaited<ReturnType<typeof findOrder>> = null;
  let limited: string | null = null;

  if (route.kind === "marketplace") {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
    const limit = await rateLimit(`order-lookup:${ip}`, 20, 5 * 60_000);
    if (!limit.ok) {
      limited = `Too many lookups. Please try again in ${retryAfterLabel(limit.retryAfter)}.`;
    } else {
      order = await findOrder(route.orderNumber);
    }
  }

  return (
    <>
      <PageHeader
        title="Track an Order"
        subtitle="Enter your order number, data reference, or the phone number you paid with."
        crumbs={[{ label: "Order tracking" }]}
      />

      <Container className="py-8">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
            <div className="mb-4 flex items-center gap-2">
              <PackageSearch className="h-5 w-5 text-niki-orange" />
              <h2 className="font-semibold text-niki-ink">Where&apos;s my order?</h2>
            </div>
            <OrderLookup defaultValue={q ?? ""} />
          </div>

          {limited ? (
            <p
              role="alert"
              className="rounded-2xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger"
            >
              {limited}
            </p>
          ) : null}

          {!limited && route.kind === "marketplace" && !order ? (
            <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge">
              <p className="flex items-start gap-2 text-sm text-niki-ink/75">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-niki-danger" />
                <span>
                  We couldn&apos;t find an order matching{" "}
                  <strong className="font-semibold">{route.orderNumber}</strong>. Check the number
                  and try again.
                </span>
              </p>
              <p className="mt-3 text-sm text-niki-ink/60">
                Bought a data bundle? Search with your <strong>ND-</strong> reference or the phone
                number you paid with — or go straight to the{" "}
                <Link href="/data-bundles/orders" className="font-semibold text-niki-orange hover:underline">
                  data order tracker
                </Link>
                .
              </p>
            </div>
          ) : null}

          {order ? <OrderCard order={order} /> : null}
        </div>
      </Container>
    </>
  );
}

/**
 * The public view of a marketplace order.
 *
 * Deliberately narrow. This is reachable without signing in, so it carries what
 * the buyer needs to know — where the order has got to and what is in it — and
 * nothing an unwelcome guesser could use: no delivery address, no phone, no
 * email, no pickup OTP.
 */
async function findOrder(orderNumber: string) {
  try {
    return await prisma.order.findUnique({
      where: { orderNumber },
      select: {
        orderNumber: true,
        status: true,
        total: true,
        createdAt: true,
        deliveryMethod: true,
        hasAbroadItems: true,
        pickupPoint: { select: { name: true, locationName: true } },
        shipment: {
          select: {
            processingAt: true,
            transitAt: true,
            outForDeliveryAt: true,
            deliveredAt: true,
            forwarderReceivedAt: true,
            arrivedGhanaAt: true,
          },
        },
        items: { select: { quantity: true, product: { select: { name: true } } } },
      },
    });
  } catch {
    // A database hiccup should read as "not found", not a 500 on a public page.
    return null;
  }
}

function OrderCard({ order }: { order: NonNullable<Awaited<ReturnType<typeof findOrder>>> }) {
  const method = order.deliveryMethod === "pickup" ? "pickup" : "delivery";
  const timestamps: ShipmentTimestamps = {
    processingAt: order.shipment?.processingAt ?? null,
    transitAt: order.shipment?.transitAt ?? null,
    outForDeliveryAt: order.shipment?.outForDeliveryAt ?? null,
    deliveredAt: order.shipment?.deliveredAt ?? null,
    forwarderReceivedAt: order.shipment?.forwarderReceivedAt ?? null,
    arrivedGhanaAt: order.shipment?.arrivedGhanaAt ?? null,
  };
  // An imported order's timeline has two extra steps; a domestic one's does not.
  const route: ShipmentRoute = order.hasAbroadItems ? "abroad" : "domestic";

  return (
    <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink">
            Order {order.orderNumber}
          </h2>
          <p className="mt-0.5 text-sm text-niki-ink/60">
            Placed {order.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium" })} ·{" "}
            <span className="font-figures">{formatPrice(order.total)}</span>
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}
        >
          {ORDER_STATUS_LABELS[order.status] ?? order.status}
        </span>
      </div>

      <ul className="mt-4 space-y-1 border-t border-niki-edge pt-4 text-sm text-niki-ink/75">
        {order.items.map((i, k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="font-figures text-niki-ink/50">{i.quantity}×</span>
            {i.product?.name ?? "Item"}
          </li>
        ))}
      </ul>

      <div className="mt-5 flex items-center gap-2 text-sm font-medium text-niki-ink/75">
        {method === "pickup" ? (
          <>
            <MapPin className="h-4 w-4 text-niki-orange" />
            {order.pickupPoint
              ? `Collect at ${order.pickupPoint.name}${
                  order.pickupPoint.locationName ? ` — ${order.pickupPoint.locationName}` : ""
                }`
              : "Collection at a pickup point"}
          </>
        ) : (
          <>
            <Truck className="h-4 w-4 text-niki-orange" />
            Home delivery
          </>
        )}
      </div>

      <div className="mt-6 border-t border-niki-edge pt-6">
        <TrackingTimeline timestamps={timestamps} method={method} route={route} />
      </div>

      <p className="mt-5 text-xs text-niki-ink/55">
        Signed in?{" "}
        <Link href="/orders" className="font-semibold text-niki-orange hover:underline">
          My orders
        </Link>{" "}
        has your receipt, delivery details and pickup code.
      </p>
    </div>
  );
}
