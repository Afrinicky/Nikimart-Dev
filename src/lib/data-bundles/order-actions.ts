"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { cancelAndRefundOrder, type RefundOutcome } from "@/lib/data-bundles/refunds";

/**
 * Cancel a queued order and refund it — from either console.
 *
 * One action rather than two because the button lives inside the shared order
 * dialog, and a dialog that had to be told which console it was in would be a
 * prop threaded through every table just to re-state what the session already
 * knows. The session is also the only thing trusted here: an admin may cancel
 * any queued order, an agent only their own, and anybody else nothing at all.
 * The order id from the browser never decides who it belongs to.
 */
export async function cancelOrderAction(orderId: string): Promise<RefundOutcome> {
  const id = String(orderId ?? "").trim();
  if (!id) return { ok: false, error: "That order no longer exists." };

  const user = await requireUser();

  if (user.role === "ADMIN") {
    const result = await cancelAndRefundOrder(id, { by: "admin" });
    revalidatePath("/admin/data/orders");
    revalidatePath("/admin/data");
    return result;
  }

  const agent = await getAgentForUser(user.id);
  if (!agent) return { ok: false, error: "You don't have an agent account." };
  if (agent.status !== "active") {
    return { ok: false, error: "Your agent account is suspended. Please contact support." };
  }

  const result = await cancelAndRefundOrder(id, { agentId: agent.id, by: "agent" });
  revalidatePath("/agent/orders");
  revalidatePath("/agent/wallet");
  return result;
}
