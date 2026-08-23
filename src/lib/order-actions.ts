"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { callbackOrigin } from "@/lib/site";
import { requireUser } from "@/lib/session";
import { getShippingRates, getCommissionRate, getAffiliateRate } from "@/lib/settings";
import { REFERRAL_COOKIE } from "@/lib/affiliate";
import { quoteShipping, itemCbm, type ShippingLine } from "@/lib/shipping";
import { resolveCommissionRate } from "@/lib/commission";
import { affiliateLineCommission, resolveAffiliateRate } from "@/lib/affiliate-commission";
import { releaseStockForOrder, tracksStock } from "@/lib/stock";
import { isPaymentConfigured, initializeTransaction, toPesewas } from "@/lib/payments";
import { notifyOrderConfirmed, notifyStaffNewOrder } from "@/lib/order-notifications";

const payloadSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1, "Your cart is empty."),
  // Every order is collected at a NikiMart pickup point (no home delivery).
  pickupPointId: z.string().trim().min(1, "Please choose a pickup point."),
});

export type PlaceOrderInput = z.infer<typeof payloadSchema>;
export type PlaceOrderResult =
  | { ok: true; orderNumber: string; authorizationUrl?: string }
  | { ok: false; error: string };

/** Thrown inside the order transaction when a guarded stock decrement misses. */
class OutOfStockError extends Error {
  constructor(readonly productName: string) {
    super(`Out of stock: ${productName}`);
    this.name = "OutOfStockError";
  }
}

function orderNumber(): string {
  return `NM-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const user = await requireUser();

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order." };
  }
  const data = parsed.data;

  // The chosen pickup point must exist and be active.
  const pickupPoint = await prisma.pickupPoint.findFirst({
    where: { id: data.pickupPointId, isActive: true },
  });
  if (!pickupPoint) {
    return { ok: false, error: "Please choose a valid pickup point." };
  }

  // Re-price from the database — never trust client-supplied prices or CBM.
  const ids = data.items.map((i) => i.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isArchived: false },
    select: {
      id: true,
      name: true,
      price: true,
      cbm: true,
      lengthCm: true,
      widthCm: true,
      heightCm: true,
      productType: true,
      stockQuantity: true,
      affiliateEnabled: true,
      affiliateEnrolledBy: true,
      affiliateCommissionRate: true,
      category: { select: { commissionRate: true, affiliateCommissionRate: true } },
      vendor: { select: { originPickupId: true, originCountry: true } },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // Platform commission snapshot: category override, else the global default.
  const defaultCommission = await getCommissionRate();

  // Affiliate attribution: a referral cookie set by ?ref=CODE. It only earns on
  // products actually enrolled in the programme, and never on the referrer's
  // own purchases.
  const refCode = (await cookies()).get(REFERRAL_COOKIE)?.value;
  const referrer = refCode
    ? await prisma.affiliate.findUnique({
        where: { code: refCode },
        select: { id: true, userId: true, status: true, commissionRate: true },
      })
    : null;
  const activeReferrer = referrer && referrer.status === "active" && referrer.userId !== user.id ? referrer : null;
  const defaultAffiliateRate = activeReferrer
    ? (activeReferrer.commissionRate ?? (await getAffiliateRate()))
    : 0;

  const lineItems = data.items
    .filter((i) => productById.has(i.productId))
    .map((i) => {
      const p = productById.get(i.productId)!;
      const commissionRate = resolveCommissionRate(p.category?.commissionRate, defaultCommission);
      const affiliate = activeReferrer
        ? resolveAffiliateRate({
            affiliateEnabled: p.affiliateEnabled,
            affiliateEnrolledBy: p.affiliateEnrolledBy,
            affiliateCommissionRate: p.affiliateCommissionRate,
            categoryAffiliateRate: p.category?.affiliateCommissionRate,
            defaultAffiliateRate,
            platformCommissionRate: commissionRate,
          })
        : { rate: 0, fundedBy: "" as const };
      return {
        productId: i.productId,
        name: p.name,
        productType: p.productType,
        stockQuantity: p.stockQuantity,
        quantity: i.quantity,
        unitPrice: p.price,
        cbm: itemCbm(p),
        originHubId: p.vendor?.originPickupId ?? null,
        originCountry: p.vendor?.originCountry ?? "GH",
        commissionRate,
        affiliateCommissionRate: affiliate.rate,
        affiliateCommission: affiliateLineCommission(p.price, i.quantity, affiliate.rate),
        affiliateFundedBy: affiliate.fundedBy,
      };
    });

  if (lineItems.length === 0) {
    return { ok: false, error: "None of the items in your cart are available." };
  }

  // Stock check up front so the buyer gets a useful message rather than a bare
  // failure. The authoritative check is the guarded decrement below.
  const shortItem = lineItems.find((i) => tracksStock(i.productType) && i.stockQuantity < i.quantity);
  if (shortItem) {
    return {
      ok: false,
      error:
        shortItem.stockQuantity > 0
          ? `Only ${shortItem.stockQuantity} of "${shortItem.name}" left in stock.`
          : `"${shortItem.name}" just sold out.`,
    };
  }

  const subtotal = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  // Shipping fee — recomputed server-side with the CBM route engine.
  const rates = await getShippingRates();
  const shippingLines: ShippingLine[] = lineItems.map((i) => ({
    cbm: i.cbm,
    quantity: i.quantity,
    originHubId: i.originHubId,
    originCountry: i.originCountry,
  }));
  const deliveryFee = quoteShipping(shippingLines, pickupPoint.id, rates);
  const total = subtotal + deliveryFee;

  // The order's affiliate commission is the sum of its enrolled lines.
  const affiliateId = activeReferrer?.id ?? null;
  const affiliateCommission =
    Math.round(lineItems.reduce((s, i) => s + i.affiliateCommission, 0) * 100) / 100;

  // A freight agent to carry the consignment from the seller hub to the pickup
  // point, if one exists.
  const freightAgent = await prisma.user.findFirst({ where: { role: "FREIGHT" }, select: { id: true } });

  // The shipment moves goods from the seller's origin hub to the pickup point.
  const destination = `${pickupPoint.name} — ${pickupPoint.locationName}`;

  // When Paystack is configured we collect payment before fulfilling: the order
  // starts as "pending" and is marked "paid" only after Paystack confirms it
  // (via /checkout/verify or the webhook). Without keys we keep the simulated
  // flow so local dev and preview deploys still work end-to-end.
  const collectPayment = isPaymentConfigured();
  const initialStatus = collectPayment ? "pending" : "paid";

  // Create with a few retries in case the generated order number collides.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.$transaction(async (tx) => {
        // Reserve stock first. The `gte` guard makes the decrement atomic, so
        // two buyers racing for the last unit can't both win — the loser
        // matches zero rows and the whole transaction rolls back.
        for (const item of lineItems) {
          if (!tracksStock(item.productType)) continue;
          const reserved = await tx.product.updateMany({
            where: { id: item.productId, stockQuantity: { gte: item.quantity } },
            data: { stockQuantity: { decrement: item.quantity } },
          });
          if (reserved.count === 0) {
            throw new OutOfStockError(item.name);
          }
        }

        return tx.order.create({
          data: {
            orderNumber: orderNumber(),
            status: initialStatus,
            subtotal,
            deliveryFee,
            total,
            deliveryMethod: "pickup",
            address: null,
            pickupPointId: pickupPoint.id,
            userId: user.id,
            affiliateId,
            affiliateCommission,
            items: {
              create: lineItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                commissionRate: i.commissionRate,
                affiliateCommissionRate: i.affiliateCommissionRate,
                affiliateCommission: i.affiliateCommission,
                affiliateFundedBy: i.affiliateFundedBy,
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
            callbackUrl: `${callbackOrigin()}/checkout/verify`,
            metadata: { orderId: order.id, userId: user.id },
          });
          return { ok: true, orderNumber: order.orderNumber, authorizationUrl };
        } catch (err) {
          // The order never became payable — cancel it and put the reserved
          // stock back, otherwise the units stay locked behind a dead order.
          await prisma.order
            .update({ where: { id: order.id }, data: { status: "cancelled" } })
            .catch(() => {});
          await releaseStockForOrder(order.id).catch(() => {});
          return {
            ok: false,
            error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
          };
        }
      }

      // Simulated payment path is paid immediately — notify buyer + staff after
      // the response is sent, so a slow SMS/email provider never blocks checkout.
      after(async () => {
        await notifyOrderConfirmed(order.id);
        await notifyStaffNewOrder(order.id);
      });

      revalidatePath("/orders");
      revalidatePath("/account");
      revalidatePath("/admin/orders");
      revalidatePath("/freight");
      revalidatePath("/pickup");
      return { ok: true, orderNumber: order.orderNumber };
    } catch (err) {
      // Someone else took the last unit between our check and our reservation.
      // Retrying can't help, so surface it straight away.
      if (err instanceof OutOfStockError) {
        return { ok: false, error: `"${err.productName}" just sold out. Please update your cart.` };
      }
      // unique collision on orderNumber/trackingNumber — retry with new values
      if (attempt === 4) {
        return { ok: false, error: "Could not place the order. Please try again." };
      }
    }
  }
  return { ok: false, error: "Could not place the order. Please try again." };
}
