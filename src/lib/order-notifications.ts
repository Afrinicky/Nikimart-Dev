import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, emailShell } from "@/lib/notifications";

const money = (n: number) => `GHS ${n.toFixed(2)}`;

/** Notify the buyer that their order is confirmed/paid. Fire-and-forget. */
export async function notifyOrderConfirmed(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, total: true, user: { select: { name: true, phone: true, email: true } } },
    });
    if (!order) return;
    const first = order.user.name?.split(" ")[0] ?? "there";
    const sms = `Hi ${first}, your NikiMart order ${order.orderNumber} is confirmed. Total ${money(order.total)}. Track it in your account.`;
    await notify(order.user, {
      sms,
      emailSubject: `Order ${order.orderNumber} confirmed`,
      emailHtml: emailShell(
        `Your order <strong>${order.orderNumber}</strong> is confirmed and being prepared.<br/>Total: <strong>${money(order.total)}</strong>.<br/><br/>You can track its progress any time from your NikiMart account.`,
        "Order confirmed 🎉",
      ),
    });
  } catch {
    // best-effort
  }
}

/** Notify the buyer of a tracking update. Fire-and-forget. */
export async function notifyShipmentUpdate(orderId: string, statusLabel: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { orderNumber: true, user: { select: { name: true, phone: true, email: true } } },
    });
    if (!order) return;
    const sms = `NikiMart: your order ${order.orderNumber} is now "${statusLabel}". Track it in your account.`;
    await notify(order.user, {
      sms,
      emailSubject: `Order ${order.orderNumber}: ${statusLabel}`,
      emailHtml: emailShell(
        `Your order <strong>${order.orderNumber}</strong> status is now <strong>${statusLabel}</strong>.`,
        "Delivery update",
      ),
    });
  } catch {
    // best-effort
  }
}
