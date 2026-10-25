"use client";

import { ActionForm } from "@/components/medical/console/ActionForm";
import { approvePurchaseOrder } from "@/lib/medical/procurement/actions";

/**
 * Approve and send a draft purchase order.
 *
 * A separate, deliberate act. Raising an order and committing the money are
 * two decisions, and the second is restricted to the roles accountable for
 * spending — a buyer does not approve their own order.
 */
export function ApproveOrderButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  return (
    <ActionForm
      action={approvePurchaseOrder}
      submitLabel="Approve and send"
      pendingLabel="Approving…"
      className="[&>div]:mt-0"
    >
      <input type="hidden" name="purchaseOrderId" value={purchaseOrderId} />
    </ActionForm>
  );
}
