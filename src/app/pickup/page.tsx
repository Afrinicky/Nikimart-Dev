import type { Metadata } from "next";
import { MapPin, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/dashboard/StatCard";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { requireDashboard } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatPrice } from "@/lib/format";
import { ORDER_STATUS_LABELS, statusTone } from "@/lib/order-status";
import { ConfirmStageButton } from "@/components/order/ConfirmStageButton";
import { ReleaseParcel } from "@/components/pickup/ReleaseParcel";
import { getCollections, maskPhone } from "@/lib/pickup-collection";
import {
  confirmActionLabel,
  nextStageForRole,
  type ShipmentRoute,
  type ShipmentTimestamps,
} from "@/lib/tracking";

export const metadata: Metadata = {
  title: "Pickup Dashboard — Nickimart",
};

export const dynamic = "force-dynamic";

export default async function PickupDashboardPage() {
  const user = await requireDashboard("/pickup");

  // A pickup operator manages one point; admins see all points.
  const pickupPoints = await prisma.pickupPoint.findMany({
    where: user.role === "ADMIN" ? {} : { operatorId: user.id },
    include: {
      orders: {
        where: { deliveryMethod: "pickup" },
        include: { user: true, items: true, shipment: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const allOrders = pickupPoints.flatMap((p) => p.orders);
  const awaiting = allOrders.filter((o) => o.status !== "delivered" && o.status !== "cancelled");
  const collected = allOrders.filter((o) => o.status === "delivered");
  // One query for every parcel's code state, rather than one per card.
  const collections = await getCollections(allOrders.map((o) => o.id));

  return (
    <>
      <PageHeader
        title="Pickup Dashboard"
        subtitle="Manage orders routed to your pickup point."
        crumbs={[{ label: "Pickup" }]}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-2 rounded-full bg-niki-black px-4 py-2 text-sm font-medium text-white">
            <MapPin className="h-4 w-4 text-niki-orange" />
            {user.name}
          </span>
          <LogoutButton />
        </div>
      </PageHeader>

      <Container className="py-8">
        {pickupPoints.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-niki-edge">
            You are not assigned to a pickup point yet. Ask an administrator to link your account.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Pickup points" value={pickupPoints.length} />
              <StatCard label="Total orders" value={allOrders.length} />
              <StatCard label="Awaiting collection" value={awaiting.length} />
              <StatCard label="Collected" value={collected.length} />
            </div>

            <p className="mt-4 flex items-start gap-2 rounded-2xl bg-white px-5 py-4 text-sm text-niki-ink/65 ring-1 ring-niki-edge">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
              <span>
                Every parcel is released against the code texted to the buyer. Ask for it, type it
                in, and write down who is taking it — including when somebody is collecting on the
                buyer&apos;s behalf.
              </span>
            </p>

            {pickupPoints.map((point) => (
              <section key={point.id} className="mt-8">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg font-bold text-niki-ink">{point.name}</h2>
                    <p className="text-sm text-niki-ink/60">
                      {point.address} · Code{" "}
                      <span className="font-semibold text-niki-ink/80">{point.code}</span>
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      point.isActive ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"
                    }`}
                  >
                    {point.isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {point.orders.length === 0 ? (
                  <p className="mt-4 rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-niki-edge">
                    No orders routed here yet.
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {point.orders.map((order) => {
                      const route: ShipmentRoute = order.hasAbroadItems ? "abroad" : "domestic";
                      const ts: ShipmentTimestamps = order.shipment
                        ? {
                            processingAt: order.shipment.processingAt,
                            transitAt: order.shipment.transitAt,
                            outForDeliveryAt: order.shipment.outForDeliveryAt,
                            deliveredAt: order.shipment.deliveredAt,
                            forwarderReceivedAt: order.shipment.forwarderReceivedAt,
                            arrivedGhanaAt: order.shipment.arrivedGhanaAt,
                          }
                        : {
                            processingAt: null,
                            transitAt: null,
                            outForDeliveryAt: null,
                            deliveredAt: null,
                          };
                      const next =
                        order.shipment && order.status !== "cancelled"
                          ? nextStageForRole(user.role, "pickup", ts, route)
                          : null;
                      // The hand-over is not a confirm button. It needs the
                      // buyer's code and a record of who took the parcel, so
                      // it gets its own card (lib/pickup-actions.ts).
                      const handover = next === "delivered";
                      const collection = collections.get(order.id) ?? null;

                      return (
                        <div
                          key={order.id}
                          className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <div className="min-w-0">
                              <p className="font-semibold text-niki-ink">
                                Order {order.orderNumber}
                              </p>
                              <p className="mt-0.5 text-sm text-niki-ink/60">
                                {order.user.name ?? order.user.email} · {order.items.length} item
                                {order.items.length === 1 ? "" : "s"} · {formatPrice(order.total)}
                              </p>
                              {collection?.collectedAt ? (
                                <p className="mt-1 text-xs text-niki-ink/55">
                                  Collected by{" "}
                                  <span className="font-semibold text-niki-ink/75">
                                    {collection.collectorName}
                                  </span>
                                  {collection.collectorRelation !== "buyer"
                                    ? ` (${collection.collectorRelation})`
                                    : ""}
                                  {collection.method === "override" ? " · released without a code" : ""}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-3">
                              <span
                                className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}
                              >
                                {ORDER_STATUS_LABELS[order.status] ?? order.status}
                              </span>
                              {next && !handover && order.shipment ? (
                                <ConfirmStageButton
                                  shipmentId={order.shipment.id}
                                  stage={next}
                                  label={confirmActionLabel(next, "pickup", route)}
                                />
                              ) : null}
                              {handover ? (
                                <ReleaseParcel
                                  orderId={order.id}
                                  orderNumber={order.orderNumber}
                                  buyerName={order.user.name ?? "the buyer"}
                                  buyerPhoneMasked={maskPhone(order.user.phone)}
                                  isAdmin={user.role === "ADMIN"}
                                  collection={
                                    collection
                                      ? {
                                          hasLiveCode: collection.hasLiveCode,
                                          codeHint: collection.codeHint,
                                          codeSentAt: collection.codeSentAt?.toISOString() ?? null,
                                          attemptsLeft: collection.attemptsLeft,
                                          locked: collection.locked,
                                          issued: collection.issued,
                                        }
                                      : null
                                  }
                                />
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </>
        )}
      </Container>
    </>
  );
}
