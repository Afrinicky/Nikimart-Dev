"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getDeliveryFee } from "@/lib/settings";

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
});

export type PlaceOrderInput = z.infer<typeof payloadSchema>;
export type PlaceOrderResult = { ok: true; orderNumber: string } | { ok: false; error: string };

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

  if (data.deliveryMethod === "delivery" && !data.address) {
    return { ok: false, error: "Please enter a delivery address." };
  }
  if (data.deliveryMethod === "pickup" && !data.pickupPointId) {
    return { ok: false, error: "Please choose a pickup point." };
  }

  // Re-price from the database — never trust client-supplied prices.
  const ids = data.items.map((i) => i.productId);
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const priceById = new Map(products.map((p) => [p.id, p.price]));

  const lineItems = data.items
    .filter((i) => priceById.has(i.productId))
    .map((i) => ({ productId: i.productId, quantity: i.quantity, unitPrice: priceById.get(i.productId)! }));

  if (lineItems.length === 0) {
    return { ok: false, error: "None of the items in your cart are available." };
  }

  const subtotal = lineItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const deliveryFee = data.deliveryMethod === "pickup" ? 0 : await getDeliveryFee();
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

  // Create with a few retries in case the generated order number collides.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const order = await prisma.order.create({
        data: {
          orderNumber: orderNumber(),
          status: "paid", // payment is simulated for now
          subtotal,
          deliveryFee,
          total,
          deliveryMethod: data.deliveryMethod,
          address: data.deliveryMethod === "delivery" ? data.address : null,
          pickupPointId: data.deliveryMethod === "pickup" ? (pickupPoint?.id ?? null) : null,
          userId: user.id,
          items: { create: lineItems },
          shipment: {
            create: {
              trackingNumber: `NMF-${Date.now().toString(36).toUpperCase()}`,
              status: "processing",
              origin: "NikiMart Warehouse",
              destination,
              eta: new Date(Date.now() + 1000 * 60 * 60 * 48),
              freightAgentId: freightAgent?.id ?? null,
            },
          },
        },
      });

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
