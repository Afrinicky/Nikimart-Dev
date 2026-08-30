"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { callbackOrigin } from "@/lib/site";
import { requireUser } from "@/lib/session";
import { getCommissionRate, getAffiliateRate } from "@/lib/settings";
import { REFERRAL_COOKIE } from "@/lib/affiliate";
import { itemCbm } from "@/lib/shipping";
import { resolveCommissionRate } from "@/lib/commission";
import { affiliateLineCommission, resolveAffiliateRate } from "@/lib/affiliate-commission";
import { releaseStockForOrder, tracksStock } from "@/lib/stock";
import { amountDueNow, balanceAfter, type PaymentPlan } from "@/lib/abroad-costs";
import { priceCart } from "@/lib/abroad-pricing";
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
  // Every order is collected at a Nickimart pickup point (no home delivery).
  pickupPointId: z.string().trim().min(1, "Please choose a pickup point."),
  // Whether the buyer ticked the shipped-from-abroad acknowledgement at
  // checkout. Checked against the cart below: a claim from the browser is
  // exactly the kind of claim that must not be taken on trust.
  acceptedAbroadTerms: z.boolean().optional(),
  // "full" settles the whole landed bill now. "goods_only" pays for the goods,
  // the tax at source and leg 1, leaving the freight into Ghana, the duty, the
  // Ghana tax and the domestic leg to be settled on arrival — at whatever those
  // cost then, which is the trade the buyer is shown before they choose it.
  paymentPlan: z.enum(["full", "goods_only"]).optional(),
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
      preorderInfo: true,
      stockQuantity: true,
      affiliateEnabled: true,
      affiliateEnrolledBy: true,
      affiliateCommissionRate: true,
      category: { select: { commissionRate: true, affiliateCommissionRate: true } },
      vendor: { select: { originPickupId: true, originCountry: true } },
    },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  // The landed bill, recomputed here from the database. Never trust a price,
  // a CBM, a freight leg or a tax rate that arrived from a browser: the whole
  // point of an eight-row bill is that a buyer can read it, and the only way
  // that stays true is if the number they are charged is derived here.
  const pricing = await priceCart(
    data.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    pickupPoint.id,
  );

  // An imported item is money handed over for something that is still in
  // another country, on terms that vary per listing. Checkout shows those terms
  // and asks the buyer to accept them; this is where that acceptance is
  // actually required, because the tick arrived from a browser and the order is
  // being created here. Only listings that *have* terms count — one nobody
  // wrote terms for shows no panel, so there is nothing to have accepted.
  const needsAbroadConsent = pricing.lines.some((l) => l.abroad);
  if (needsAbroadConsent && !data.acceptedAbroadTerms) {
    return { ok: false, error: "Please read and accept the shipped-from-abroad terms before paying." };
  }

  // A route the admin has not priced would quote zero international freight and
  // bill the platform for the difference. Refuse rather than under-charge.
  if (pricing.unpricedRoute) {
    return {
      ok: false,
      error:
        "Freight into Ghana isn't priced for one of these items yet. Please try again shortly or contact support.",
    };
  }

  // The goods-only plan is only on offer when the platform allows it and every
  // imported line does. Asking for it otherwise is a claim from the browser
  // that has to lose.
  const plan: PaymentPlan =
    data.paymentPlan === "goods_only" && pricing.partialPaymentAvailable ? "goods_only" : "full";

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
      // The priced line from the landed-cost engine. Matched by product id; a
      // line the engine dropped (an archived product, say) is filtered out
      // below rather than ordered at a price nobody computed.
      const priced = pricing.lines.find((l) => l.productId === i.productId);
      return {
        productId: i.productId,
        name: p.name,
        productType: p.productType,
        stockQuantity: p.stockQuantity,
        quantity: i.quantity,
        unitPrice: p.price,
        cbm: itemCbm(p),
        originHubId: p.vendor?.originPickupId ?? null,
        originCountry: priced?.originCountry ?? p.vendor?.originCountry ?? "GH",
        commissionRate,
        affiliateCommissionRate: affiliate.rate,
        affiliateCommission: affiliateLineCommission(p.price, i.quantity, affiliate.rate),
        affiliateFundedBy: affiliate.fundedBy,
        priced,
      };
    })
    .filter((i) => i.priced !== undefined);

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

  // The bill, straight off the engine. `subtotal` stays the goods alone and
  // `deliveryFee` stays the domestic leg, so every existing report, payout and
  // export keeps meaning what it meant; the international legs, duty and taxes
  // are the new columns beside them.
  const bill = pricing.bill;
  const subtotal = bill.goods;
  const deliveryFee = bill.domesticFreight;
  const total = bill.total;
  // What is collected today, and what is left for arrival. Under the full plan
  // the freight is locked: a rate rise afterwards is the platform's, not the
  // buyer's. Under goods_only it is not, which is exactly what the buyer chose.
  const dueNow = amountDueNow(bill, plan);
  const balanceDue = balanceAfter(bill, plan);
  const freightLocked = plan === "full";
  const hasAbroadItems = pricing.hasAbroad;

  // The order's affiliate commission is the sum of its enrolled lines.
  const affiliateId = activeReferrer?.id ?? null;
  const affiliateCommission =
    Math.round(lineItems.reduce((s, i) => s + i.affiliateCommission, 0) * 100) / 100;

  // A freight agent to carry the consignment from the seller hub to the pickup
  // point, if one exists.
  const freightAgent = await prisma.user.findFirst({ where: { role: "FREIGHT" }, select: { id: true } });

  // The shipment moves goods from the seller's origin hub to the pickup point —
  // or, for an imported consignment, from wherever abroad it starts, through the
  // Ghana arrival point named on the listing.
  const destination = `${pickupPoint.name} — ${pickupPoint.locationName}`;
  const abroadLine = pricing.lines.find((l) => l.abroad);
  const arrivalPointId = abroadLine?.arrivalPoint?.id ?? null;
  const origin = abroadLine
    ? abroadLine.terms?.sourceLocation || `Supplier — ${abroadLine.originCountry}`
    : "Nickimart Warehouse";

  // When Paystack is configured we collect payment before fulfilling: the order
  // starts as "pending" and is marked "paid" only after Paystack confirms it
  // (via /checkout/verify or the webhook). Without keys we keep the simulated
  // flow so local dev and preview deploys still work end-to-end.
  const collectPayment = isPaymentConfigured();
  const initialStatus = collectPayment ? "pending" : "paid";

  // How long until it lands. Two days is right for a parcel crossing Accra and
  // absurd for one crossing an ocean, so an imported consignment takes the
  // transit time its route is configured with, plus the supplier's own lead
  // time, and the buyer sees a date they can plan around.
  const etaDays = abroadLine
    ? Math.max(
        3,
        (abroadLine.terms?.processingDays ?? 0) +
          (abroadLine.arrivalPoint?.rates.find(
            (r) =>
              (r.originCountry === abroadLine.originCountry || r.originCountry === "*") &&
              (r.mode === abroadLine.terms?.freightMode || r.mode === "*"),
          )?.transitDays ?? 21),
      )
    : 2;

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
            // The landed bill, snapshotted. Rates move; what somebody was
            // quoted and charged must not move with them.
            hasAbroadItems,
            originTax: bill.originTax,
            supplierFreight: bill.supplierFreight,
            internationalFreight: bill.internationalFreight,
            importDuty: bill.importDuty,
            clearingFee: bill.clearingFee,
            ghanaTax: bill.ghanaTax,
            paymentPlan: plan,
            amountPaid: collectPayment ? 0 : dueNow,
            balanceDue,
            freightLocked,
            items: {
              create: lineItems.map((i) => ({
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                commissionRate: i.commissionRate,
                affiliateCommissionRate: i.affiliateCommissionRate,
                affiliateCommission: i.affiliateCommission,
                affiliateFundedBy: i.affiliateFundedBy,
                originTax: i.priced!.bill.originTax,
                supplierFreight: i.priced!.bill.supplierFreight,
                internationalFreight: i.priced!.bill.internationalFreight,
                importDuty: i.priced!.bill.importDuty,
                clearingFee: i.priced!.bill.clearingFee,
                ghanaTax: i.priced!.bill.ghanaTax,
                domesticFreight: i.priced!.bill.domesticFreight,
                freightMode: i.priced!.terms?.freightMode ?? "",
                freightIncluded: i.priced!.bill.freightIncluded,
                arrivalPointId: i.priced!.arrivalPoint?.id ?? null,
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
                    origin,
                    destination,
                    arrivalPointId,
                    eta: new Date(Date.now() + 1000 * 60 * 60 * 24 * etaDays),
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
            // Only what is due today. Under the goods-only plan the freight,
            // duty and Ghana tax are collected when the item lands.
            amountPesewas: toPesewas(dueNow),
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
