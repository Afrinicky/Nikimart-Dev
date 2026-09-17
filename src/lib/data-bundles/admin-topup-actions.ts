"use server";

import { after } from "next/server";
import { z } from "zod";
import { dataDb } from "@/lib/data-db";
import { requireAdmin } from "@/lib/session";
import { callbackOrigin } from "@/lib/site";
import { rateLimit, retryAfterLabel } from "@/lib/rate-limit";
import { initializeTransaction, isPaymentConfigured, toPesewas } from "@/lib/payments";
import { newDataReference, settleDataOrder } from "@/lib/data-bundles/fulfillment";
import { getActiveBundles } from "@/lib/data-bundles/catalog";
import { bundleLabel, networkLabel, NETWORKS } from "@/lib/data-bundles/networks";
import { checkRecipient } from "@/lib/data-bundles/gh-phone";

/**
 * Nickimart buying its own bundles, at the wholesale rate it charges agents.
 *
 * The admin sells to agents all day and could not buy a bundle themselves
 * without going through the public storefront and paying retail — their own
 * markup, back to themselves. This is the agent's Data Topup with the agent
 * taken out: the same ladder, the same wholesale price, paid through Paystack
 * like any other order so the money is accounted for rather than conjured.
 *
 * Nobody earns on it. There is no selling agent, so no commission and no team
 * commission, and `source` says ADMIN so the console can tell a house purchase
 * apart from a customer's.
 */

const buySchema = z.object({
  network: z.enum(NETWORKS),
  sizeGb: z.number().positive().max(1000),
  recipientPhone: z.string().min(9, "Enter the number to top up."),
  email: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
});

export type AdminBuyResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

export async function adminBuyBundle(input: z.infer<typeof buySchema>): Promise<AdminBuyResult> {
  const admin = await requireAdmin();

  const parsed = buySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }
  const data = parsed.data;

  const recipient = checkRecipient(data.recipientPhone, data.network, networkLabel(data.network));
  if (!recipient.ok) return { ok: false, error: recipient.message };
  const recipientPhone = recipient.local;

  const limit = await rateLimit(`admin-topup:${admin.id}`, 60, 10 * 60_000);
  if (!limit.ok) {
    return { ok: false, error: `Too many orders. Please try again in ${retryAfterLabel(limit.retryAfter)}.` };
  }

  // Re-read the price at purchase: the browser posts a network and a size, so a
  // stale page can never sell at a stale price. A bundle with no agent price is
  // not wholesaled at all, and is not buyable here either.
  const bundles = await getActiveBundles();
  const row = bundles.find(
    (b) => b.network === data.network && b.sizeGb === data.sizeGb && b.agentPrice > 0,
  );
  if (!row) return { ok: false, error: "That bundle isn't available at a wholesale price." };

  const collectPayment = isPaymentConfigured("data");
  const email = data.email?.trim() || admin.email || null;

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = newDataReference();
    try {
      const order = await dataDb.dataOrder.create({
        data: {
          reference,
          network: row.network,
          sizeGb: row.sizeGb,
          // The wholesale rate, and the real upstream cost beside it, so the
          // profit report reads a house purchase honestly rather than as pure
          // margin.
          price: row.agentPrice,
          costPrice: row.costPrice,
          recipientPhone,
          buyerPhone: recipientPhone,
          buyerEmail: email,
          buyerName: "Nickimart",
          status: "pending",
          paymentStatus: "unpaid",
          // No agent, so nothing is earned on it by anybody.
          agentId: null,
          source: "ADMIN",
          agentCost: row.agentPrice,
          agentCommission: 0,
          commissionStatus: "void",
          teamCommission: 0,
          teamCommissionStatus: "void",
        },
      });

      if (!collectPayment) {
        after(async () => {
          await settleDataOrder(reference);
        });
        return { ok: true, reference };
      }

      try {
        const { authorizationUrl } = await initializeTransaction(
          {
            email: email ?? `${recipientPhone}@data.nikimart.app`,
            amountPesewas: toPesewas(row.agentPrice),
            reference,
            callbackUrl: `${callbackOrigin()}/admin/data/topup/verify`,
            metadata: {
              kind: "data-bundle",
              dataOrderId: order.id,
              network: row.network,
              size: bundleLabel(row.sizeGb),
              recipientPhone,
              boughtBy: "admin",
            },
          },
          "data",
        );
        return { ok: true, reference, authorizationUrl };
      } catch (err) {
        await dataDb.dataOrder.delete({ where: { id: order.id } }).catch(() => {});
        return {
          ok: false,
          error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
        };
      }
    } catch {
      if (attempt === 4) return { ok: false, error: "Could not place the order. Please try again." };
    }
  }
  return { ok: false, error: "Could not place the order. Please try again." };
}
