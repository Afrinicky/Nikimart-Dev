import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * One purchase, with everything a claim would be made of.
 *
 * The record used to be a reference, a supplier name and a total. That is
 * enough to say a purchase happened and nothing like enough for the case that
 * costs money: the supplier who took payment and never shipped. What was
 * paid, in what currency, through which channel, against which invoice, and
 * what was promised in writing — that is the claim, and none of it could be
 * reconstructed afterwards.
 *
 * The vocabulary — payment methods, what a payment was for, how a dispute
 * stands — lives in `purchase-fields`, which the forms can import without
 * dragging the database client into the browser.
 */

export * from "@/lib/retail/purchase-fields";

export async function getPurchase(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      vendor: { select: { id: true, businessName: true } },
      forwarder: {
        select: { id: true, name: true, contactName: true, contactPhone: true, contactEmail: true },
      },
      route: { select: { id: true, name: true, mode: true, minDays: true, maxDays: true } },
      placedBy: { select: { id: true, name: true, email: true } },
      payments: {
        orderBy: { paidAt: "desc" },
        include: { recordedBy: { select: { name: true, email: true } } },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, emoji: true, slug: true } },
          order: {
            select: {
              id: true,
              orderNumber: true,
              createdAt: true,
              status: true,
              user: { select: { name: true, email: true, phone: true } },
            },
          },
        },
      },
    },
  });
}

export type PurchaseDossier = NonNullable<Awaited<ReturnType<typeof getPurchase>>>;
