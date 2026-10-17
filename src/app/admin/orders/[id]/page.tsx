import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BadgeCheck,
  ClipboardList,
  ExternalLink,
  Gift,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Phone,
  Receipt,
  ShoppingBag,
  Store,
  Truck,
  User,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { OrderStatusSelect } from "@/components/admin/OrderStatusSelect";
import { StageAdvance } from "@/components/admin/retail/StageAdvance";
import { PaymentPill, StagePill } from "@/components/admin/retail/StagePill";
import { CollectionPanel } from "@/components/admin/retail/CollectionPanel";
import { ActionLink } from "@/components/ui/motion";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { deleteOrder } from "@/lib/admin-actions";
import { requireDashboard } from "@/lib/session";
import { formatPrice } from "@/lib/format";
import { normalizeGhPhone } from "@/lib/phone";
import { getCollection, maskPhone } from "@/lib/pickup-collection";
import { isDeferredPlan } from "@/lib/cart-bill";
import { parseAbroadTerms } from "@/lib/abroad";
import { buildTimeline } from "@/lib/tracking";
import { freightModeLabel } from "@/lib/shipping";
import { deriveStage, nextAction, stageLabelFor } from "@/lib/retail/fulfilment";
import { getOrderDossier } from "@/lib/retail/orders";

export const metadata: Metadata = { title: "Order — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One order, in full.
 *
 * The screen this console did not have. An admin could see that an order
 * existed and what it cost, and then had to go and find the buyer, the shop,
 * the forwarder and the purchase in four other places — on the phone to a
 * customer, which is when this screen is always opened.
 *
 * So everything about an order is here: who bought it and how to reach them,
 * where it is going, what they have paid and what is still owed and why, which
 * shop and which supplier each line came from, which purchase covers it, which
 * affiliate earns on it, what has been said about it, and where it has got to.
 * Every one of those is a link to the place it is managed, because a dossier
 * that cannot be acted on is a report.
 *
 * And the one thing the old screen *could* do, it did wrongly: the status
 * dropdown wrote a word and left the buyer's timeline untouched. The next
 * action here confirms the stage properly, through the same door the seller
 * and the freight agent use. The dropdown stays, in the corner, labelled for
 * what it is.
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboard("/admin");
  const { id } = await params;

  const order = await getOrderDossier(id);
  if (!order) notFound();

  const method: "pickup" | "delivery" = order.deliveryMethod === "pickup" ? "pickup" : "delivery";
  // Only a parcel going over a counter has one, so only that one is read.
  const collection = method === "pickup" ? await getCollection(order.id) : null;
  const route: "domestic" | "abroad" = order.hasAbroadItems ? "abroad" : "domestic";
  const placed = order.items.some((i) => i.purchaseOrderId);
  const stage = deriveStage({ status: order.status, shipment: order.shipment, placed });
  const next = nextAction(stage, method, route);
  const wa = normalizeGhPhone(order.user.phone);
  const deferred = isDeferredPlan(order.paymentPlan) && order.balanceDue > 0;
  const timeline = order.shipment ? buildTimeline(order.shipment, method, route) : [];

  // The purchases that cover this order's lines, de-duplicated: one purchase
  // usually covers several lines, and listing it per line reads as several
  // purchases.
  const purchases = [
    ...new Map(
      order.items
        .map((i) => i.purchaseOrder)
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => [p.id, p]),
    ).values(),
  ];

  const commission = order.affiliateCommissions.reduce(
    (s, c) => (c.status === "reversed" ? s : s + c.amount),
    0,
  );
  const sellerFreight = order.items.reduce((s, i) => s + i.supplierFreight, 0);
  const intlFreight = order.items.reduce((s, i) => s + i.internationalFreight, 0);
  const goodsTotal = order.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`Placed ${order.createdAt.toLocaleString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })} by ${order.user.name ?? order.user.email}`}
        crumbs={[
          { label: "Admin", href: "/admin" },
          { label: "Order fulfilment", href: "/admin/orders" },
          { label: order.orderNumber },
        ]}
      >
        <Link
          href="/admin/orders"
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
        >
          <ArrowLeft className="h-4 w-4" /> Orders
        </Link>
      </PageHeader>

      <Container className="py-8">
        {/* Where it is, before anything else. */}
        <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StagePill stage={stage} method={method} route={route} />
              <PaymentPill
                total={order.total}
                amountPaid={order.amountPaid}
                balanceDue={order.balanceDue}
              />
              <span className="rounded-full bg-niki-ink/5 px-2.5 py-1 text-[11px] font-semibold text-niki-ink/60">
                {route === "abroad" ? "Shipped from abroad" : "Local"}
              </span>
              <span className="rounded-full bg-niki-ink/5 px-2.5 py-1 text-[11px] font-semibold text-niki-ink/60">
                {method === "pickup" ? "Collected at a pickup point" : "Delivered to the buyer"}
              </span>
              {order.shipment?.trackingNumber ? (
                <Link
                  href={`/order-tracking/${order.orderNumber}`}
                  className="rounded-full bg-niki-trust/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-niki-trust hover:bg-niki-trust/20"
                >
                  {order.shipment.trackingNumber}
                </Link>
              ) : null}
            </div>
            <p className="font-figures text-2xl font-bold text-niki-ink">
              {formatPrice(order.total)}
            </p>
          </div>

          {timeline.length > 0 ? (
            <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {timeline.map((step) => (
                <li
                  key={step.stage}
                  className={`rounded-xl px-3.5 py-3 ring-1 ${
                    step.current
                      ? "bg-niki-orange/[0.08] ring-niki-orange/30"
                      : step.done
                        ? "bg-niki-success/[0.06] ring-niki-success/25"
                        : "bg-niki-surface/60 ring-niki-edge"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {step.done ? (
                      <BadgeCheck
                        className={`h-4 w-4 shrink-0 ${step.current ? "text-niki-orange" : "text-niki-success"}`}
                      />
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-niki-ink/20" />
                    )}
                    <p
                      className={`text-sm font-semibold ${step.done ? "text-niki-ink" : "text-niki-ink/50"}`}
                    >
                      {step.label}
                    </p>
                  </div>
                  <p className="mt-0.5 pl-6 text-[11px] text-niki-ink/45">
                    {step.at
                      ? step.at.toLocaleString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : `Waiting on ${step.role.toLowerCase()}`}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-xl bg-niki-surface/60 px-4 py-3 text-sm text-niki-ink/55 ring-1 ring-niki-edge">
              No shipment yet — one is created the moment the payment is confirmed.
            </p>
          )}
        </section>

        {stage === "awaiting_payment" ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl bg-niki-gold/15 p-4 text-sm text-niki-ink/80 ring-1 ring-niki-gold/30">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              This order is <strong>pending payment</strong> — the buyer started checkout and never
              finished. Nothing has been reserved with a supplier. Reach them below.
            </span>
          </div>
        ) : null}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-5">
            {/* Items — with the shop and the supplier behind each one. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-display font-bold text-niki-ink">What was bought</h2>
                  <p className="text-xs text-niki-ink/55">
                    {order.items.length} line{order.items.length === 1 ? "" : "s"} ·{" "}
                    {order.items.reduce((s, i) => s + i.quantity, 0)} unit
                    {order.items.reduce((s, i) => s + i.quantity, 0) === 1 ? "" : "s"}
                  </p>
                </div>
              </div>

              <div className="-mx-5 mt-4 overflow-x-auto px-5">
                <table className="w-full min-w-[840px] border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className="bg-niki-surface/70">
                      <th className={`${th} rounded-l-xl`}>Product</th>
                      <th className={th}>Shop</th>
                      <th className={th}>Supplier</th>
                      <th className={th}>Purchase</th>
                      <th className={th}>Qty</th>
                      <th className={`${th} rounded-r-xl text-right`}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((it) => {
                      const terms = parseAbroadTerms(it.product.preorderInfo);
                      const supplierName =
                        terms?.supplierName || it.product.supplierName || "";
                      const supplierUrl = terms?.sourceUrl || it.product.sourceUrl || "";
                      return (
                        <tr
                          key={it.id}
                          className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                        >
                          <td className={td}>
                            <Link
                              href={`/admin/products/${it.productId}`}
                              className="block max-w-[15rem] truncate font-medium text-niki-ink hover:text-niki-orange"
                              title={it.product.name}
                            >
                              <span className="mr-1.5" aria-hidden>
                                {it.product.emoji}
                              </span>
                              {it.product.name}
                            </Link>
                            <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                              {formatPrice(it.unitPrice)} each
                              {it.freightRoute
                                ? ` · ${freightModeLabel(it.freightRoute.mode)}`
                                : ""}
                              {it.shippingDeferred ? " · shipping on collection" : ""}
                            </span>
                          </td>

                          <td className={td}>
                            {it.product.vendor ? (
                              <Link
                                href={`/admin/vendors/${it.product.vendor.id}`}
                                className="block max-w-[10rem] truncate text-xs font-medium text-niki-ink/75 hover:text-niki-orange"
                                title={it.product.vendor.businessName}
                              >
                                {it.product.vendor.businessName}
                              </Link>
                            ) : (
                              <span className="text-xs text-niki-ink/40">—</span>
                            )}
                            {it.product.vendor?.owner ? (
                              <span className="mt-0.5 block text-[11px] text-niki-ink/45">
                                {it.product.vendor.owner.name ?? it.product.vendor.owner.email}
                              </span>
                            ) : null}
                          </td>

                          <td className={td}>
                            {supplierUrl ? (
                              <a
                                href={supplierUrl}
                                target="_blank"
                                rel="noopener noreferrer nofollow"
                                className="inline-flex max-w-[10rem] items-center gap-1 truncate text-xs font-medium text-niki-ink/75 hover:text-niki-orange"
                              >
                                <span className="truncate">{supplierName || "Listing"}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            ) : (
                              <span className="text-xs text-niki-ink/70">
                                {supplierName || "—"}
                              </span>
                            )}
                          </td>

                          <td className={td}>
                            {it.purchaseOrder ? (
                              <span className="font-mono text-[11px] font-semibold text-niki-ink/75">
                                {it.purchaseOrder.reference}
                              </span>
                            ) : it.product.productType === "in_stock" ? (
                              <span className="text-[11px] text-niki-ink/40">In stock</span>
                            ) : (
                              <ActionLink
                                href="/admin/orders/placement"
                                className="text-[11px] font-semibold text-niki-orange hover:underline"
                              >
                                Not yet placed
                              </ActionLink>
                            )}
                          </td>

                          <td className={`${td} font-figures text-niki-ink/75`}>{it.quantity}</td>
                          <td className={`${td} text-right font-figures font-semibold text-niki-ink`}>
                            {formatPrice(it.unitPrice * it.quantity)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Money: what was charged, what landed, what is still owed. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex items-center gap-2 text-niki-ink">
                <Banknote className="h-4 w-4 text-niki-orange" />
                <h2 className="font-display font-bold">Payment</h2>
              </div>
              <p className="mt-1 text-xs text-niki-ink/55">
                The bill as it was quoted on the day, snapshotted — a later rate change cannot
                rewrite what somebody was charged.
              </p>

              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <dl className="space-y-1.5 text-sm">
                  <Money label="Items" value={order.subtotal || goodsTotal} />
                  {sellerFreight > 0 ? (
                    <Money label="Supplier → forwarder" value={sellerFreight} muted />
                  ) : null}
                  {intlFreight > 0 ? (
                    <Money label="Forwarder → Ghana" value={intlFreight} muted />
                  ) : null}
                  <Money
                    label={route === "abroad" ? "Delivery in Ghana" : "Shipping"}
                    value={order.deliveryFee}
                    free={order.deliveryFee === 0}
                  />
                  <div className="flex justify-between gap-3 border-t border-niki-edge pt-2 font-figures font-bold text-niki-ink">
                    <dt>Total</dt>
                    <dd>{formatPrice(order.total)}</dd>
                  </div>
                  <Money label="Paid" value={order.amountPaid} />
                  <div
                    className={`flex justify-between gap-3 font-semibold ${
                      order.balanceDue > 0 ? "text-niki-orange" : "text-niki-success"
                    }`}
                  >
                    <dt>Outstanding</dt>
                    <dd className="font-figures">{formatPrice(order.balanceDue)}</dd>
                  </div>
                </dl>

                <div
                  className={`rounded-xl p-4 text-sm ring-1 ${
                    deferred
                      ? "bg-niki-gold/10 text-amber-900 ring-niki-gold/30"
                      : "bg-niki-surface/60 text-niki-ink/70 ring-niki-edge"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                    Payment plan
                  </p>
                  {deferred ? (
                    <>
                      <p className="mt-1 font-semibold text-niki-ink">
                        Goods paid up front, shipping on collection
                      </p>
                      <p className="mt-1.5">
                        The buyer settled {formatPrice(order.amountPaid)} at checkout and owes{" "}
                        <strong>{formatPrice(order.balanceDue)}</strong> when they collect. That
                        figure is the quote from the day they ordered; because the freight was not
                        locked, the rate in force on arrival is what they pay, so it may differ.
                      </p>
                      <p className="mt-2 text-xs">
                        Collect it at{" "}
                        {order.pickupPoint?.name ?? (method === "pickup" ? "the pickup point" : "handover")}
                        .
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 font-semibold text-niki-ink">
                        {order.amountPaid > 0 ? "Paid in full at checkout" : "Nothing collected yet"}
                      </p>
                      <p className="mt-1.5">
                        {order.amountPaid > 0
                          ? order.freightLocked
                            ? "Shipping is locked at the rate quoted when the order was placed — a later rise is absorbed, not passed on."
                            : "Nothing is outstanding on this order."
                          : "The buyer started checkout and did not finish, so no money has been captured and nothing is reserved."}
                      </p>
                    </>
                  )}
                  <Link
                    href={`/admin/finance/transactions?q=${encodeURIComponent(order.orderNumber)}`}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-niki-trust hover:underline"
                  >
                    <Receipt className="h-3.5 w-3.5" />
                    The transactions for this order
                  </Link>
                </div>
              </div>
            </section>

            {/* Shipping and handover. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex items-center gap-2 text-niki-ink">
                {method === "pickup" ? (
                  <MapPin className="h-4 w-4 text-niki-orange" />
                ) : (
                  <Truck className="h-4 w-4 text-niki-orange" />
                )}
                <h2 className="font-display font-bold">Shipping &amp; handover</h2>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl bg-niki-surface/60 p-4 ring-1 ring-niki-edge">
                  <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                    {method === "pickup" ? "Collection point" : "Delivery address"}
                  </p>
                  {method === "pickup" ? (
                    order.pickupPoint ? (
                      <>
                        <p className="mt-1 font-semibold text-niki-ink">
                          {order.pickupPoint.name}{" "}
                          <span className="font-mono text-xs font-normal text-niki-ink/45">
                            {order.pickupPoint.code}
                          </span>
                        </p>
                        <p className="mt-0.5 text-sm text-niki-ink/65">
                          {order.pickupPoint.address}
                          {order.pickupPoint.locationName
                            ? `, ${order.pickupPoint.locationName}`
                            : ""}
                        </p>
                        {order.pickupPoint.openingHours ? (
                          <p className="mt-0.5 text-xs text-niki-ink/45">
                            Open {order.pickupPoint.openingHours}
                          </p>
                        ) : null}
                        {order.pickupPoint.operator ? (
                          <p className="mt-2 text-xs text-niki-ink/55">
                            Operator: {order.pickupPoint.operator.name ?? order.pickupPoint.operator.email}
                            {order.pickupPoint.operator.phone
                              ? ` · ${order.pickupPoint.operator.phone}`
                              : ""}
                          </p>
                        ) : null}
                        <Link
                          href="/admin/shipping/locations"
                          className="mt-2 inline-flex text-xs font-semibold text-niki-trust hover:underline"
                        >
                          Pickup points
                        </Link>
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-niki-ink/55">No pickup point recorded.</p>
                    )
                  ) : (
                    <p className="mt-1 whitespace-pre-line text-sm text-niki-ink/75">
                      {order.address?.trim() || order.user.address?.trim() || "No address recorded."}
                    </p>
                  )}
                </div>

                <div className="rounded-xl bg-niki-surface/60 p-4 ring-1 ring-niki-edge">
                  <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/50">
                    Freight
                  </p>
                  {order.shipment ? (
                    <>
                      <p className="mt-1 text-sm text-niki-ink/75">
                        {order.shipment.carrier} · {order.shipment.origin} →{" "}
                        {order.shipment.destination}
                      </p>
                      <p className="mt-0.5 text-xs text-niki-ink/55">
                        {stageLabelFor(stage, method, route)}
                        {order.shipment.eta
                          ? ` · ETA ${order.shipment.eta.toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}`
                          : ""}
                      </p>
                      {order.shipment.arrivalPoint ? (
                        <p className="mt-1.5 text-xs text-niki-ink/55">
                          Lands at {order.shipment.arrivalPoint.name}
                          {order.shipment.arrivalPoint.city
                            ? `, ${order.shipment.arrivalPoint.city}`
                            : ""}
                        </p>
                      ) : null}
                      {order.shipment.freightAgent ? (
                        <p className="mt-1 text-xs text-niki-ink/55">
                          Agent: {order.shipment.freightAgent.name ?? order.shipment.freightAgent.email}
                          {order.shipment.freightAgent.phone
                            ? ` · ${order.shipment.freightAgent.phone}`
                            : ""}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-niki-ink/55">
                      No shipment yet — created when the payment is confirmed.
                    </p>
                  )}

                  {/* The lanes the lines are travelling on, where they differ. */}
                  {[
                    ...new Map(
                      order.items
                        .filter((i) => i.freightRoute)
                        .map((i) => [i.freightRoute!.id, i.freightRoute!]),
                    ).values(),
                  ].map((r) => (
                    <p key={r.id} className="mt-2 text-xs text-niki-ink/55">
                      {r.forwarder?.name ?? "Forwarder"} · {r.name || freightModeLabel(r.mode)}
                      {r.destinationPoint ? ` → ${r.destinationPoint.name}` : ""}
                      {r.forwarder?.contactPhone ? ` · ${r.forwarder.contactPhone}` : ""}
                      {r.forwarder ? (
                        <Link
                          href={`/admin/shipping/forwarders/${r.forwarder.id}`}
                          className="ml-1.5 font-semibold text-niki-trust hover:underline"
                        >
                          rates
                        </Link>
                      ) : null}
                    </p>
                  ))}
                </div>
              </div>
            </section>

            {/* Who took it, or what is standing between it and being taken. */}
            {method === "pickup" ? (
              <CollectionPanel
                orderId={order.id}
                buyerPhoneMasked={maskPhone(order.user.phone)}
                collection={
                  collection
                    ? {
                        hasLiveCode: collection.hasLiveCode,
                        codeHint: collection.codeHint,
                        codeSentAt: collection.codeSentAt?.toISOString() ?? null,
                        issued: collection.issued,
                        attempts: collection.attempts,
                        attemptsLeft: collection.attemptsLeft,
                        locked: collection.locked,
                        collectedAt: collection.collectedAt?.toISOString() ?? null,
                        method: collection.method,
                        collectorName: collection.collectorName,
                        collectorPhone: collection.collectorPhone,
                        collectorIdType: collection.collectorIdType,
                        collectorIdNumber: collection.collectorIdNumber,
                        collectorRelation: collection.collectorRelation,
                        overrideReason: collection.overrideReason,
                        releasedByName: collection.releasedByName,
                      }
                    : null
                }
              />
            ) : null}

            {/* The purchases that cover it. */}
            {purchases.length > 0 ? (
              <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <div className="flex items-center gap-2 text-niki-ink">
                  <ClipboardList className="h-4 w-4 text-niki-orange" />
                  <h2 className="font-display font-bold">Bought from the supplier</h2>
                </div>
                <ul className="mt-3 space-y-2">
                  {purchases.map((p) => (
                    <li
                      key={p.id}
                      className="rounded-xl bg-niki-surface/60 px-4 py-3 ring-1 ring-niki-edge"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-mono text-xs font-bold text-niki-ink">{p.reference}</p>
                        <span className="text-xs text-niki-ink/55">
                          {p.status === "received"
                            ? "Received by forwarder"
                            : p.status === "cancelled"
                              ? "Cancelled"
                              : "Ordered from supplier"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-niki-ink/60">
                        {p.supplierName || "Supplier"} · {formatPrice(p.totalCost)}
                        {p.placedAt
                          ? ` · placed ${p.placedAt.toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}`
                          : ""}
                        {p.placedBy ? ` by ${p.placedBy.name ?? p.placedBy.email}` : ""}
                      </p>
                      {p.note ? (
                        <p className="mt-1 text-xs italic text-niki-ink/55">“{p.note}”</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <ActionLink
                  href="/admin/orders/placement"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-niki-trust hover:underline"
                >
                  The placement queue
                </ActionLink>
              </section>
            ) : null}

            {/* What has been said about it. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex items-center gap-2 text-niki-ink">
                <MessageCircle className="h-4 w-4 text-niki-orange" />
                <h2 className="font-display font-bold">Notes &amp; complaints</h2>
              </div>
              {order.affiliateThreads.length === 0 ? (
                <p className="mt-2 text-sm text-niki-ink/55">
                  Nothing has been raised about this order.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {order.affiliateThreads.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/admin/affiliates/support/${t.id}`}
                        className="block rounded-xl bg-niki-surface/60 px-4 py-3 ring-1 ring-niki-edge transition-colors hover:bg-niki-surface"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-niki-ink">
                            {t.subject || t.topic}
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              t.status === "resolved"
                                ? "bg-niki-success/10 text-niki-success"
                                : t.priority === "urgent" || t.topic === "complaint"
                                  ? "bg-niki-danger/10 text-niki-danger"
                                  : "bg-niki-gold/20 text-amber-900"
                            }`}
                          >
                            {t.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-niki-ink/60">
                          {t.lastMessageText || "No messages yet."}
                        </p>
                        <p className="mt-1 text-[11px] text-niki-ink/40">
                          {t.topic} · {t.affiliate?.name ?? "Support"}
                          {t.lastMessageAt
                            ? ` · ${t.lastMessageAt.toLocaleString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                            : ""}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <aside className="h-fit space-y-4">
            {/* What to do next. First in the column, because it is the reason
                the window was opened. */}
            {next ? (
              next.stage && order.shipment ? (
                <StageAdvance
                  shipmentId={order.shipment.id}
                  stage={next.stage}
                  label={next.label}
                  detail={next.detail}
                />
              ) : (
                <section className="rounded-2xl bg-niki-orange/[0.07] p-5 ring-1 ring-niki-orange/25">
                  <p className="text-xs font-semibold uppercase tracking-wide text-niki-orange">
                    Next action
                  </p>
                  <p className="mt-1 text-sm text-niki-ink/75">{next.detail}</p>
                  {next.href ? (
                    <ActionLink
                      href={next.href}
                      className="niki-press niki-focus mt-4 inline-flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white"
                    >
                      <ClipboardList className="h-4 w-4" />
                      {next.label}
                    </ActionLink>
                  ) : wa ? (
                    <a
                      href={`https://wa.me/${wa}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="niki-press mt-4 inline-flex items-center gap-2 rounded-full bg-niki-success px-5 py-2.5 text-sm font-bold text-white"
                    >
                      <MessageCircle className="h-4 w-4" />
                      {next.label}
                    </a>
                  ) : null}
                </section>
              )
            ) : (
              <section className="rounded-2xl bg-niki-success/[0.07] p-5 ring-1 ring-niki-success/25">
                <p className="text-xs font-semibold uppercase tracking-wide text-niki-success">
                  Nothing outstanding
                </p>
                <p className="mt-1 text-sm text-niki-ink/75">
                  {stage === "cancelled"
                    ? "This order was cancelled. Nothing is owed and nothing is shipping."
                    : "The buyer has it. This order is complete."}
                </p>
              </section>
            )}

            {/* The buyer, and how to reach them. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="mb-3 flex items-center gap-2 text-niki-ink">
                <User className="h-4 w-4 text-niki-orange" />
                <h2 className="font-display text-sm font-bold">Buyer</h2>
              </div>
              <Link
                href={`/admin/users/${order.user.id}`}
                className="font-semibold text-niki-ink hover:text-niki-orange"
              >
                {order.user.name ?? "Customer"}
              </Link>
              <p className="text-sm text-niki-ink/60">{order.user.email}</p>
              {order.user.phone ? (
                <p className="font-mono text-sm text-niki-ink/60">{order.user.phone}</p>
              ) : (
                <p className="text-xs text-niki-danger">No phone number on this account.</p>
              )}
              {order.user.address ? (
                <p className="mt-2 whitespace-pre-line text-sm text-niki-ink/60">
                  {order.user.address}
                </p>
              ) : null}
              <p className="mt-2 text-xs text-niki-ink/45">
                {order.user._count.orders} order
                {order.user._count.orders === 1 ? "" : "s"} · with Nickimart since{" "}
                {order.user.createdAt.toLocaleDateString("en-GB", {
                  month: "short",
                  year: "numeric",
                })}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {wa ? (
                  <a
                    href={`https://wa.me/${wa}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-success/10 px-3 py-1.5 text-xs font-semibold text-niki-success"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                ) : null}
                {order.user.phone ? (
                  <a
                    href={`tel:${order.user.phone}`}
                    className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-black/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call
                  </a>
                ) : null}
                <a
                  href={`mailto:${order.user.email}`}
                  className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-black/5 px-3 py-1.5 text-xs font-semibold text-niki-ink/70"
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </a>
              </div>
            </section>

            {/* The affiliate who earns on it. */}
            {order.affiliate ? (
              <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <div className="mb-3 flex items-center gap-2 text-niki-ink">
                  <Gift className="h-4 w-4 text-niki-orange" />
                  <h2 className="font-display text-sm font-bold">Affiliate</h2>
                </div>
                <Link
                  href={`/admin/affiliates/${order.affiliate.id}`}
                  className="font-semibold text-niki-ink hover:text-niki-orange"
                >
                  {order.affiliate.name}
                </Link>
                {order.affiliate.code ? (
                  <p className="font-mono text-xs text-niki-ink/45">{order.affiliate.code}</p>
                ) : null}
                <p className="mt-1 text-sm text-niki-ink/60">
                  {order.affiliate.phone || order.affiliate.email || order.affiliate.user?.email}
                </p>
                <p className="mt-2 text-sm">
                  <span className="text-niki-ink/55">Commission </span>
                  <span className="font-figures font-bold text-niki-ink">
                    {formatPrice(commission || order.affiliateCommission)}
                  </span>
                </p>
                {order.affiliateCommissions.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-[11px] text-niki-ink/50">
                    {order.affiliateCommissions.map((c) => (
                      <li key={c.id}>
                        {formatPrice(c.amount)} · {c.status}
                        {c.fundedBy ? ` · funded by the ${c.fundedBy}` : ""}
                        {c.holdUntil
                          ? ` · clears ${c.holdUntil.toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                            })}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href="/admin/affiliates/commissions"
                  className="mt-3 inline-flex text-xs font-semibold text-niki-trust hover:underline"
                >
                  The commission ledger
                </Link>
              </section>
            ) : null}

            {/* The shops whose goods these are. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="mb-3 flex items-center gap-2 text-niki-ink">
                <Store className="h-4 w-4 text-niki-orange" />
                <h2 className="font-display text-sm font-bold">
                  Shop{order.items.length > 1 ? "s" : ""}
                </h2>
              </div>
              <ul className="space-y-2.5">
                {[
                  ...new Map(
                    order.items
                      .filter((i) => i.product.vendor)
                      .map((i) => [i.product.vendor!.id, i.product.vendor!]),
                  ).values(),
                ].map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`/admin/vendors/${v.id}`}
                      className="text-sm font-semibold text-niki-ink hover:text-niki-orange"
                    >
                      {v.businessName}
                    </Link>
                    <p className="text-xs text-niki-ink/55">
                      {v.owner?.name ?? v.owner?.email ?? "No owner linked"}
                      {v.owner?.phone ? ` · ${v.owner.phone}` : ""}
                    </p>
                    {v.whatsapp ? (
                      <a
                        href={`https://wa.me/${v.whatsapp.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-niki-success hover:underline"
                      >
                        <MessageCircle className="h-3 w-3" /> WhatsApp the shop
                      </a>
                    ) : null}
                  </li>
                ))}
                {order.items.every((i) => !i.product.vendor) ? (
                  <li className="text-sm text-niki-ink/50">No shop linked to these items.</li>
                ) : null}
              </ul>
            </section>

            {/* Where else this order is visible. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <h2 className="font-display text-sm font-bold text-niki-ink">Elsewhere</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                <LinkRow
                  href={`/order-tracking/${order.orderNumber}`}
                  icon={Package}
                  label="The buyer's tracking page"
                />
                <LinkRow
                  href={`/orders/${order.orderNumber}/receipt`}
                  icon={Receipt}
                  label="The receipt as the buyer sees it"
                />
                <LinkRow
                  href={`/admin/orders?q=${encodeURIComponent(order.user.email)}`}
                  icon={ShoppingBag}
                  label="Everything this buyer has ordered"
                />
                <LinkRow
                  href={`/admin/users/${order.user.id}`}
                  icon={User}
                  label="The buyer's account"
                />
              </ul>
            </section>

            {/* The override, labelled for what it is. */}
            <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <h2 className="font-display text-sm font-bold text-niki-ink">Set the status by hand</h2>
              <p className="mb-3 mt-1 text-xs text-niki-ink/50">
                Use the next action above where you can — it stamps the stage and tells the buyer.
                This writes the order&apos;s status directly and holds the timeline where you put it.
              </p>
              <OrderStatusSelect id={order.id} status={order.status} />
              {order.status === "cancelled" ? (
                <div className="mt-4 border-t border-niki-edge pt-3">
                  <p className="mb-2 text-xs text-niki-ink/50">
                    Cancelled, so it can be removed outright. This cannot be undone.
                  </p>
                  <DeleteButton
                    id={order.id}
                    action={deleteOrder}
                    label="Delete this order"
                    title="Delete order"
                  />
                </div>
              ) : null}
            </section>
          </aside>
        </div>
      </Container>
    </>
  );
}

const th = "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
const td = "px-4 py-3 align-middle";

function Money({
  label,
  value,
  muted,
  free,
}: {
  label: string;
  value: number;
  muted?: boolean;
  free?: boolean;
}) {
  return (
    <div className={`flex justify-between gap-3 ${muted ? "text-niki-ink/55" : "text-niki-ink/70"}`}>
      <dt>{label}</dt>
      <dd className="shrink-0 font-medium text-niki-ink">
        {free ? <span className="text-niki-success">Free</span> : formatPrice(value)}
      </dd>
    </div>
  );
}

function LinkRow({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-niki-ink/70 transition-colors hover:bg-niki-surface hover:text-niki-ink"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-niki-ink/40" />
        <span className="text-xs font-medium">{label}</span>
      </Link>
    </li>
  );
}
