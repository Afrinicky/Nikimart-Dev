"use server";

import { revalidatePath } from "next/cache";
import { requireDataAdminAction } from "@/lib/data-bundles/session";
import { markRefundSent, type RefundSettleOutcome } from "@/lib/data-bundles/refunds";

/**
 * Clearing the refunds queue.
 *
 * A refund owed to a buyer on mobile money is a transfer somebody makes, so
 * the only thing the console can do about it is record that it has been made —
 * and record who says so, because that is the whole value of the row.
 */
export async function markRefundSentAdmin(refundId: string): Promise<RefundSettleOutcome> {
  const admin = await requireDataAdminAction();
  const who = admin.name || admin.email || admin.id;
  const result = await markRefundSent(String(refundId ?? ""), who);
  if (result.ok) {
    revalidatePath("/admin/data/transactions/refunds");
    revalidatePath("/admin/data");
  }
  return result;
}
