import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, emailShell, type Recipient } from "@/lib/notifications";
import { getStaffNotifyChannel } from "@/lib/settings";
import {
  SHIPMENT_STAGES,
  confirmedIndex,
  responsibleRole,
  stageLabel,
  type DeliveryMethod,
  type ShipmentTimestamps,
} from "@/lib/tracking";
import type { Role } from "@/lib/roles";

const money = (n: number) => `GHS ${n.toFixed(2)}`;

function dedupeRecipients(list: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const out: Recipient[] = [];
  for (const r of list) {
    const key = `${r.phone ?? ""}|${r.email ?? ""}`;
    if (key === "|" || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** All admins' contact details. */
async function adminRecipients(): Promise<Recipient[]> {
  return prisma.user.findMany({ where: { role: "ADMIN" }, select: { name: true, phone: true, email: true } });
}

/** The vendor owners with an item in this order. */
async function sellerRecipients(orderId: string): Promise<Recipient[]> {
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: { product: { select: { vendor: { select: { owner: { select: { name: true, phone: true, email: true } } } } } } },
  });
  const owners = items.map((i) => i.product.vendor.owner).filter((o): o is NonNullable<typeof o> => o !== null);
  return dedupeRecipients(owners);
}

/** Recipients for a role given an order (for job hand-offs). */
async function recipientsForRole(
  order: { pickupPointId: string | null; shipment: { freightAgentId: string | null } | null },
  role: Role,
  orderId: string,
): Promise<Recipient[]> {
  if (role === "SELLER") return sellerRecipients(orderId);
  if (role === "ADMIN") return adminRecipients();
  if (role === "FREIGHT") {
    if (order.shipment?.freightAgentId) {
      const u = await prisma.user.findUnique({ where: { id: order.shipment.freightAgentId }, select: { name: true, phone: true, email: true } });
      return u ? [u] : [];
    }
    return prisma.user.findMany({ where: { role: "FREIGHT" }, select: { name: true, phone: true, email: true } });
  }
  if (role === "PICKUP" && order.pickupPointId) {
    const point = await prisma.pickupPoint.findUnique({
      where: { id: order.pickupPointId },
      select: { operator: { select: { name: true, phone: true, email: true } } },
    });
    return point?.operator ? [point.operator] : [];
  }
  return [];
}

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

/**
 * Notify staff about a new paid order: the sellers who have items to prepare,
 * plus admins for oversight. Uses the admin's chosen channel. Fire-and-forget.
 */
export async function notifyStaffNewOrder(orderId: string): Promise<void> {
  try {
    const [order, channel] = await Promise.all([
      prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true, total: true } }),
      getStaffNotifyChannel(),
    ]);
    if (!order) return;

    const sellers = await sellerRecipients(orderId);
    const admins = await adminRecipients();

    const sellerMsg = `NikiMart: new order ${order.orderNumber} — you have item(s) to prepare. Confirm when ready in your seller dashboard.`;
    const adminMsg = `NikiMart: new order ${order.orderNumber} placed (${money(order.total)}).`;

    await Promise.allSettled([
      ...sellers.map((r) =>
        notify(r, { sms: sellerMsg, emailSubject: `New order ${order.orderNumber}`, emailHtml: emailShell(`You have a new order <strong>${order.orderNumber}</strong> with item(s) to prepare. Confirm it in your seller dashboard.`, "New order") }, channel),
      ),
      ...admins.map((r) =>
        notify(r, { sms: adminMsg, emailSubject: `New order ${order.orderNumber}`, emailHtml: emailShell(`New order <strong>${order.orderNumber}</strong> placed. Total ${money(order.total)}.`, "New order") }, channel),
      ),
    ]);
  } catch {
    // best-effort
  }
}

/**
 * After a stage is confirmed, alert whoever owns the next stage — but only when
 * the responsible role changes (a hand-off), so freight isn't pinged twice in a
 * row. `actingRole` is the role that just confirmed. Fire-and-forget.
 */
export async function notifyNextResponsible(orderId: string, actingRole: Role): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        deliveryMethod: true,
        pickupPointId: true,
        shipment: {
          select: {
            freightAgentId: true,
            processingAt: true, transitAt: true, outForDeliveryAt: true, deliveredAt: true,
          },
        },
      },
    });
    if (!order?.shipment) return;

    const method: DeliveryMethod = order.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const ts: ShipmentTimestamps = {
      processingAt: order.shipment.processingAt,
      transitAt: order.shipment.transitAt,
      outForDeliveryAt: order.shipment.outForDeliveryAt,
      deliveredAt: order.shipment.deliveredAt,
    };
    const nextIdx = confirmedIndex(ts) + 1;
    if (nextIdx >= SHIPMENT_STAGES.length) return; // fully delivered

    const nextStage = SHIPMENT_STAGES[nextIdx];
    const role = responsibleRole(nextStage, method);
    if (role === actingRole) return; // same role continues — no hand-off ping

    const channel = await getStaffNotifyChannel();
    const recipients = await recipientsForRole(order, role, orderId);
    const label = stageLabel(nextStage, method);
    const msg = `NikiMart: order ${order.orderNumber} needs your action — ${label}.`;
    await Promise.allSettled(
      recipients.map((r) =>
        notify(r, { sms: msg, emailSubject: `Action needed: ${order.orderNumber}`, emailHtml: emailShell(`Order <strong>${order.orderNumber}</strong> is ready for you: <strong>${label}</strong>.`, "You have a job") }, channel),
      ),
    );
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
