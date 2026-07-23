"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getDeliveryConfig, getCommissionRate } from "@/lib/settings";
import { quoteDeliveryFee, totalCartWeight } from "@/lib/delivery";
import { resolveCommissionRate } from "@/lib/commission";
import { isPaymentConfigured, initializeTransaction, toPesewas } from "@/lib/payments";
import { notifyOrderConfirmed } from "@/lib/order-notifications";

const payloadSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "Your cart is empty."),
  deliveryMethod: z.enum(["delivery", "pickup"]),
  address: z.string().trim().optional(),
  pickupPointId: z.string().trim().optional(),
  destinationLocationId: z.string().trim().optional(),
});

export type PlaceOrderInput = z.infer<typeof payloadSchema>;
export type PlaceOrderResult =
  | { ok: true; orderNumber: string; authorizationUrl?: string }
  | { ok: false; error: string };

function orderNumber(): string {
  return `NM-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

/** Absolute origin of the current request, for building Paystack callback URLs. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const user = await requireUser();

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order." };
  }
  const data = parsed.data;

  if (data.deliveryMethod === "delivery" && !data.address) {
    return { ok: false, error: "Please enter a delivery address." };
  }
  if (data.deliveryMethod === "pickup" && !data.pickupPointId) {
    return { ok: false, error: "Please choose a pickup point." };
  }

  // Re-price from the database — never trust client-supplied prices or weights.
  const ids = data.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      price: true,
      shippingWeightKg: true,
      category: { select: { commissionRate: true } },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // Platform commission snapshot: category override, else the global default.
  const defaultCommission = await getCommissionRate();

  const lineItems = data.items
    .filter((i) => productById.has(i.productId))
    .map((i) => {
      const p = productById.get(i.productId)!;
      return {
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: p.price,
        weightKg: p.shippingWeightKg,
        commissionRate: resolveCommissionRate(p.category?.commissionRate, defaultCommission),
      };
    });

  if (lineItems.length === 0) {
    return { ok: false, error: "None of the items in your cart are available." };
  }

  const subtotal = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  // Delivery fee — recomputed server-side with the weight/zone engine.
  const destinationLocation =
    data.deliveryMethod === "delivery" && data.destinationLocationId
      ? await prisma.location.findUnique({
          where: { id: data.destinationLocationId },
          select: { deliveryZoneMultiplier: true },
        })
      : null;
  const deliveryConfig = await getDeliveryConfig();
  const deliveryFee = quoteDeliveryFee({
    method: data.deliveryMethod,
    totalWeightKg: totalCartWeight(lineItems),
    zoneMultiplier: destinationLocation?.deliveryZoneMultiplier ?? 1,
    config: deliveryConfig,
  });
  const total = subtotal + deliveryFee;

  // A freight agent to carry delivery consignments, if one exists.
  const freightAgent =
    data.deliveryMethod === "delivery"
      ? await prisma.user.findFirst({ where: { role: "FREIGHT" }, select: { id: true } })
      : null;

  // Resolve pickup point + a readable destination for the shipment.
  const pickupPoint = data.pickupPointId
    ? await prisma.pickupPoint.findUnique({ where: { id: data.pickupPointId } })
    : null;
  const destination =
    data.deliveryMethod === "pickup" ? (pickupPoint?.name ?? "Pickup point") : (data.address ?? "Customer address");

  // When Paystack is configured we collect payment before fulfilling: the order
  // starts as "pending" and is marked "paid" only after Paystack confirms it
  // (via /checkout/verify or the webhook). Without keys we keep the simulated
  // flow so local dev and preview deploys still work end-to-end.
  const collectPayment = isPaymentConfigured();
  const initialStatus = collectPayment ? "pending" : "paid";

  // Create with a few retries in case the generated order number collides.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: orderNumber(),
          status: initialStatus,
          subtotal,
          deliveryFee,
          total,
          deliveryMethod: data.deliveryMethod,
          address: data.deliveryMethod === "delivery" ? data.address : null,
          pickupPointId: data.deliveryMethod === "pickup" ? (pickupPoint?.id ?? null) : null,
          userId: user.id,
          items: {
            create: lineItems.map((i) => ({
              productId: i.productId,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              commissionRate: i.commissionRate,
            })),
          },
          // Fulfilment only starts once the order is paid. The simulated flow
          // is paid immediately, so the shipment is created here. The Paystack
          // flow defers shipment creation to payment confirmation (see
          // markOrderPaid) — otherwise an unpaid "pending" order would have a
          // shipment that auto-advances by elapsed time.
          shipment: collectPayment
            ? undefined
            : {
                create: {
                  trackingNumber: `NMF-${Date.now().toString(36).toUpperCase()}`,
                  status: "created", // awaiting the seller's "prepared" confirmation
                  origin: "NikiMart Warehouse",
                  destination,
                  eta: new Date(Date.now() + 1000 * 60 * 60 * 48),
                  freightAgentId: freightAgent?.id ?? null,
                },
              },
        },
      });

      // Real payment: start a Paystack transaction and hand back the hosted
      // checkout URL. If initialization fails, cancel the just-created order so
      // it doesn't linger as an unpaid "pending" record.
      if (collectPayment) {
        try {
          const { authorizationUrl } = await initializeTransaction({
            email: user.email ?? `${user.id}@nikimart.app`,
            amountPesewas: toPesewas(total),
            reference: order.orderNumber,
            callbackUrl: `${await requestOrigin()}/checkout/verify`,
            metadata: { orderId: order.id, userId: user.id },
          });
          return { ok: true, orderNumber: order.orderNumber, authorizationUrl };
        } catch (err) {
          await prisma.order
            .update({ where: { id: order.id }, data: { status: "cancelled" } })
            .catch(() => {});
          return {
            ok: false,
            error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
          };
        }
      }

      // Simulated payment path is paid immediately — notify the buyer.
      await notifyOrderConfirmed(order.id);

      revalidatePath("/orders");
      revalidatePath("/account");
      revalidatePath("/admin/orders");
      revalidatePath("/freight");
      revalidatePath("/pickup");
      return { ok: true, orderNumber: order.orderNumber };
    } catch {
      // unique collision on orderNumber/trackingNumber — retry with new values
      if (attempt === 4) {
        return { ok: false, error: "Could not place the order. Please try again." };
      }
    }
  }
  return { ok: false, error: "Could not place the order. Please try again." };
}
