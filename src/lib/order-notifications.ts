import "server-only";
import { prisma } from "@/lib/prisma";
import { notify, emailShell, type Recipient } from "@/lib/notifications";
import { getStaffNotifyChannel } from "@/lib/settings";
import {
  confirmedIndex,
  responsibleRole,
  stageLabel,
  stagesFor,
  type DeliveryMethod,
  type ShipmentRoute,
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
    const sms = `Hi ${first}, your Nickimart order ${order.orderNumber} is confirmed. Total ${money(order.total)}. Track it in your account.`;
    await notify(order.user, {
      sms,
      emailSubject: `Order ${order.orderNumber} confirmed`,
      emailHtml: emailShell(
        `Your order <strong>${order.orderNumber}</strong> is confirmed and being prepared.<br/>Total: <strong>${money(order.total)}</strong>.<br/><br/>You can track its progress any time from your Nickimart account.`,
        "Order confirmed 🎉",
      ),
    });
  } catch {
    // best-effort
  }
}

/**
 * Notify staff about a new paid order: the sellers who have items to source or
 * prepare, plus admins for oversight. Fire-and-forget.
 *
 * A seller is always told on both SMS and email, whatever the admin's channel
 * setting says. That setting exists to keep routine job hand-offs from spamming
 * freight and pickup operators; a new order is not a routine hand-off. It is
 * the one event where a missed message costs a sale — an imported item cannot
 * even begin its six-week journey until the seller has read this — and an
 * unread inbox is exactly the failure the second channel exists to cover.
 * Admins keep the configured channel, because their copy is oversight.
 */
export async function notifyStaffNewOrder(orderId: string): Promise<void> {
  try {
    const [order, channel] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderId },
        select: {
          orderNumber: true,
          total: true,
          hasAbroadItems: true,
          paymentPlan: true,
          balanceDue: true,
        },
      }),
      getStaffNotifyChannel(),
    ]);
    if (!order) return;

    const sellers = await sellerRecipients(orderId);
    const admins = await adminRecipients();

    // An imported order asks something different of the seller — place the
    // supplier order — so it says so rather than "prepare it".
    const sellerAction = order.hasAbroadItems
      ? "place the supplier order and confirm it in your seller dashboard"
      : "prepare the item(s) and confirm in your seller dashboard";
    const sellerMsg = `Nickimart: new order ${order.orderNumber} — please ${sellerAction}.`;
    const balanceNote =
      order.paymentPlan === "goods_only" && order.balanceDue > 0
        ? ` The buyer is paying freight on arrival — ${money(order.balanceDue)} is due when it lands.`
        : "";
    const adminMsg = `Nickimart: new order ${order.orderNumber} placed (${money(order.total)}).${balanceNote}`;

    await Promise.allSettled([
      ...sellers.map((r) =>
        notify(
          r,
          {
            sms: sellerMsg,
            emailSubject: `New order ${order.orderNumber}`,
            emailHtml: emailShell(
              `You have a new order <strong>${order.orderNumber}</strong>.<br/><br/>${
                order.hasAbroadItems
                  ? "This one ships from abroad: place the order with your supplier, then confirm it in your seller dashboard so the buyer can follow its progress."
                  : "Prepare the item(s) and confirm the order in your seller dashboard."
              }`,
              "New order",
            ),
          },
          // Both channels, always — see the note above this function.
          "both",
        ),
      ),
      ...admins.map((r) =>
        notify(r, { sms: adminMsg, emailSubject: `New order ${order.orderNumber}`, emailHtml: emailShell(`New order <strong>${order.orderNumber}</strong> placed. Total ${money(order.total)}.${balanceNote}`, "New order") }, channel),
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
        hasAbroadItems: true,
        shipment: {
          select: {
            freightAgentId: true,
            processingAt: true, transitAt: true, outForDeliveryAt: true, deliveredAt: true,
            forwarderReceivedAt: true, arrivedGhanaAt: true,
          },
        },
      },
    });
    if (!order?.shipment) return;

    const method: DeliveryMethod = order.deliveryMethod === "pickup" ? "pickup" : "delivery";
    const route: ShipmentRoute = order.hasAbroadItems ? "abroad" : "domestic";
    const ts: ShipmentTimestamps = {
      processingAt: order.shipment.processingAt,
      transitAt: order.shipment.transitAt,
      outForDeliveryAt: order.shipment.outForDeliveryAt,
      deliveredAt: order.shipment.deliveredAt,
      forwarderReceivedAt: order.shipment.forwarderReceivedAt,
      arrivedGhanaAt: order.shipment.arrivedGhanaAt,
    };
    const stages = stagesFor(route);
    const nextIdx = confirmedIndex(ts, route) + 1;
    if (nextIdx >= stages.length) return; // fully delivered

    const nextStage = stages[nextIdx];
    const role = responsibleRole(nextStage, method);
    if (role === actingRole) return; // same role continues — no hand-off ping

    const channel = await getStaffNotifyChannel();
    const recipients = await recipientsForRole(order, role, orderId);
    const label = stageLabel(nextStage, method, route);
    const msg = `Nickimart: order ${order.orderNumber} needs your action — ${label}.`;
    await Promise.allSettled(
      recipients.map((r) =>
        notify(r, { sms: msg, emailSubject: `Action needed: ${order.orderNumber}`, emailHtml: emailShell(`Order <strong>${order.orderNumber}</strong> is ready for you: <strong>${label}</strong>.`, "You have a job") }, channel),
      ),
    );
  } catch {
    // best-effort
  }
}

/**
 * Notify the buyer of a tracking update. Fire-and-forget.
 *
 * Two of these updates are not routine and get their own message: the day the
 * goods land in Ghana, and the day they are handed over. The first is what a
 * buyer has been waiting six weeks for and, on a goods-only plan, the moment
 * their balance falls due — a generic "status changed" there would bury a bill.
 * The second closes the order and is the last chance to say what to do if
 * something is wrong with it.
 */
export async function notifyShipmentUpdate(
  orderId: string,
  statusLabel: string,
  stage?: string,
): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderNumber: true,
        hasAbroadItems: true,
        paymentPlan: true,
        balanceDue: true,
        pickupPoint: { select: { name: true, locationName: true, openingHours: true } },
        shipment: { select: { arrivalPoint: { select: { name: true, city: true } } } },
        user: { select: { name: true, phone: true, email: true } },
      },
    });
    if (!order) return;

    const first = order.user.name?.split(" ")[0] ?? "there";
    const point = order.pickupPoint
      ? `${order.pickupPoint.name} — ${order.pickupPoint.locationName}`
      : "your pickup point";

    if (stage === "arrived_ghana") {
      const landedAt = order.shipment?.arrivalPoint
        ? `${order.shipment.arrivalPoint.name}${order.shipment.arrivalPoint.city ? `, ${order.shipment.arrivalPoint.city}` : ""}`
        : "Ghana";
      // On a goods-only plan the balance is now due, and burying that in a
      // status line is how a consignment sits uncollected for a fortnight.
      const balanceLine =
        order.paymentPlan === "goods_only" && order.balanceDue > 0
          ? ` Balance of ${money(order.balanceDue)} for freight, duty and delivery is now due.`
          : "";
      await notify(order.user, {
        sms: `Nickimart: good news ${first} — order ${order.orderNumber} has arrived in Ghana at ${landedAt}.${balanceLine} We'll tell you the moment it reaches ${point}.`,
        emailSubject: `Order ${order.orderNumber} has arrived in Ghana`,
        emailHtml: emailShell(
          `Hi ${first}, your order <strong>${order.orderNumber}</strong> has landed in Ghana at <strong>${landedAt}</strong>.` +
            (balanceLine
              ? `<br/><br/>Because you chose to settle the freight on arrival, a balance of <strong>${money(order.balanceDue)}</strong> is now due for freight, duty, tax and local delivery. You can pay it from your Nickimart account.`
              : "") +
            `<br/><br/>It now travels to <strong>${point}</strong>. We'll let you know as soon as it's ready to collect.`,
          "It's in the country 🇬🇭",
        ),
      });
      return;
    }

    if (stage === "delivered") {
      await notify(order.user, {
        sms: `Nickimart: order ${order.orderNumber} has been handed over at ${point}. Thank you for shopping with us — reply to your email if anything isn't right.`,
        emailSubject: `Order ${order.orderNumber} delivered`,
        emailHtml: emailShell(
          `Your order <strong>${order.orderNumber}</strong> has been handed over at <strong>${point}</strong>.<br/><br/>Thank you for shopping with Nickimart. If anything isn't right with it, get in touch — Buyer Protection covers this order.`,
          "Delivered ✅",
        ),
      });
      return;
    }

    await notify(order.user, {
      sms: `Nickimart: your order ${order.orderNumber} is now "${statusLabel}". Track it in your account.`,
      emailSubject: `Order ${order.orderNumber}: ${statusLabel}`,
      emailHtml: emailShell(
        `Your order <strong>${order.orderNumber}</strong> status is now <strong>${statusLabel}</strong>.`,
        order.hasAbroadItems ? "Shipment update" : "Delivery update",
      ),
    });
  } catch {
    // best-effort
  }
}
