"use server";

import { revalidatePath } from "next/cache";
import { requireDataUser } from "@/lib/data-bundles/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import {
  cancelAndRefundOrder,
  recreditOrderToNumber,
  type RecreditOutcome,
  type RefundDestination,
  type RefundOutcome,
} from "@/lib/data-bundles/refunds";

/**
 * What either console can do to an order it owns.
 *
 * One action per job rather than one per console, because the buttons live
 * inside the shared order sheet and a sheet that had to be told which console
 * it was in would be a prop threaded through every table just to re-state what
 * the session already knows. The session is also the only thing trusted here:
 * an admin may act on any order, an agent only on their own, and anybody else
 * on nothing at all. The order id from the browser never decides who it
 * belongs to — and nor does the destination, which is why an agent's refund is
 * forced to their own wallet below rather than read from the form.
 */

function refreshAdmin(): void {
  revalidatePath("/admin/data/orders");
  revalidatePath("/admin/data/transactions/refunds");
  revalidatePath("/admin/data");
}

function refreshAgent(): void {
  revalidatePath("/agent/orders");
  revalidatePath("/agent/wallet");
}

export interface CancelOrderInput {
  /** Admin only. An agent's refund always goes to their own wallet. */
  destination?: RefundDestination;
  momoPhone?: string;
  momoName?: string;
  momoNetwork?: string;
  note?: string;
}

/** Cancel an order and refund it — to the agent's wallet, or to the buyer. */
export async function cancelOrderAction(
  orderId: string,
  input: CancelOrderInput = {},
): Promise<RefundOutcome> {
  const id = String(orderId ?? "").trim();
  if (!id) return { ok: false, error: "That order no longer exists." };

  const user = await requireDataUser();
  const who = user.name || user.email || user.id;

  if (user.role === "ADMIN") {
    const result = await cancelAndRefundOrder(id, {
      by: "admin",
      byName: who,
      destination: input.destination === "BUYER_MOMO" ? "BUYER_MOMO" : "WALLET",
      momo: {
        phone: String(input.momoPhone ?? ""),
        name: String(input.momoName ?? ""),
        network: String(input.momoNetwork ?? ""),
      },
      note: String(input.note ?? ""),
    });
    if (result.ok) refreshAdmin();
    return result;
  }

  const agent = await getAgentForUser(user.id);
  if (!agent) return { ok: false, error: "You don't have an agent account." };
  if (agent.status !== "active") {
    return { ok: false, error: "Your agent account is suspended. Please contact support." };
  }

  const result = await cancelAndRefundOrder(id, {
    agentId: agent.id,
    by: "agent",
    byName: who,
    destination: "WALLET",
    note: String(input.note ?? ""),
  });
  if (result.ok) refreshAgent();
  return result;
}

/** Cancel the current attempt and credit the same bundle to another number. */
export async function recreditOrderAction(
  orderId: string,
  phone: string,
): Promise<RecreditOutcome> {
  const id = String(orderId ?? "").trim();
  if (!id) return { ok: false, error: "That order no longer exists." };

  const user = await requireDataUser();

  if (user.role === "ADMIN") {
    const result = await recreditOrderToNumber(id, String(phone ?? ""), { by: "admin" });
    if (result.ok) refreshAdmin();
    return result;
  }

  const agent = await getAgentForUser(user.id);
  if (!agent) return { ok: false, error: "You don't have an agent account." };
  if (agent.status !== "active") {
    return { ok: false, error: "Your agent account is suspended. Please contact support." };
  }

  const result = await recreditOrderToNumber(id, String(phone ?? ""), {
    agentId: agent.id,
    by: "agent",
  });
  if (result.ok) refreshAgent();
  return result;
}
