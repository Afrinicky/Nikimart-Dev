"use client";

import { useRef } from "react";
import { setOrderStatus } from "@/lib/admin-actions";
import { inputClass } from "@/components/ui/Field";
import { ORDER_STATUS_LABELS } from "@/lib/order-status";

const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"];

export function OrderStatusSelect({ id, status }: { id: string; status: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form action={setOrderStatus} ref={formRef}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className={`${inputClass} py-1.5 text-xs`}
        aria-label="Order status"
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {ORDER_STATUS_LABELS[s] ?? s}
          </option>
        ))}
      </select>
    </form>
  );
}
