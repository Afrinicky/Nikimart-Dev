"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { generateAffiliateCode } from "@/lib/affiliate";
import { maxPlatformFundedRate, maxSellerFundedRate } from "@/lib/affiliate-commission";
import { releaseCommission, reverseCommission } from "@/lib/affiliate-ledger";
import { resolveCommissionRate } from "@/lib/commission";
import { getCommissionRate } from "@/lib/settings";
import { formatMoney } from "@/lib/format";
import { PRODUCTS_TAG } from "@/lib/catalog";
import { updateTag } from "next/cache";
import { SETTINGS_TAG } from "@/lib/settings";
import { resolveFlyerDesign } from "@/lib/affiliate-flyer";
import { resolveWatermark } from "@/lib/affiliate-watermark";

/**
 * What an admin can do to the affiliate programme.
 *
 * Every one of these is an action on somebody else's money, so every one of
 * them leaves a row in AffiliateEvent naming who did it and why. The ledger
 * itself is never edited in place: a commission is reversed or released
 * through lib/affiliate-ledger, which records an adjustment alongside, so a
 * figure that changed can always be explained.
 */

export type AdminActionState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

async function record(
  affiliateId: string | null,
  actor: { id: string; name: string | null; email: string | null },
  action: string,
  detail = "",
) {
  return prisma.affiliateEvent
    .create({
      data: {
        affiliateId,
        actorId: actor.id,
        actorName: actor.name ?? actor.email ?? "Admin",
        action,
        detail: detail.slice(0, 500),
      },
    })
    .catch(() => null);
}

function refreshAdmin() {
  revalidatePath("/admin/affiliates");
  revalidatePath("/admin/affiliates/applications");
  revalidatePath("/admin/affiliates/commissions");
  revalidatePath("/admin/affiliates/payouts");
  revalidatePath("/admin/affiliates/fraud");
  revalidatePath("/affiliate");
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

/**
 * Approve an application and open the affiliate's console.
 *
 * The affiliate row is created here rather than when they applied, so a
 * declined application never leaves a dormant account behind that would quietly
 * start attributing if somebody later flipped its status.
 */
export async function approveApplication(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");

  const application = await prisma.affiliateApplication.findUnique({
    where: { id },
    select: { id: true, userId: true, fullName: true, email: true, phone: true, desiredCode: true, status: true },
  });
  if (!application) return { error: "That application no longer exists." };
  if (application.status === "approved") return { ok: true };

  // Already an affiliate — approve the application and leave the account be.
  const existing = application.userId
    ? await prisma.affiliate.findUnique({
        where: { userId: application.userId },
        select: { id: true },
      })
    : null;

  let affiliateId = existing?.id ?? null;

  if (!affiliateId) {
    const wanted = application.desiredCode.replace(/[^A-Z0-9]/g, "").slice(0, 12);
    const clash = wanted
      ? await prisma.affiliate.findUnique({ where: { code: wanted }, select: { id: true } })
      : null;
    const code = wanted && !clash ? wanted : await generateAffiliateCode(application.fullName);

    try {
      const created = await prisma.affiliate.create({
        data: {
          userId: application.userId,
          name: application.fullName,
          email: application.email,
          phone: application.phone,
          code,
          status: "active",
          source: "self",
          approvedAt: new Date(),
          approvedById: admin.id,
        },
        select: { id: true },
      });
      affiliateId = created.id;
    } catch {
      return { error: "Couldn't create the affiliate account. Is that code already taken?" };
    }
  }

  await prisma.affiliateApplication.update({
    where: { id: application.id },
    data: {
      status: "approved",
      decidedAt: new Date(),
      decidedById: admin.id,
      decisionNote: str(fd, "note").slice(0, 500),
      affiliateId,
    },
  });

  await record(affiliateId, admin, "application_approved", application.fullName);
  refreshAdmin();
  return { ok: true, message: `${application.fullName} is now an affiliate.` };
}

/** Decline an application, with a reason they will see. */
export async function rejectApplication(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const note = str(fd, "note").slice(0, 500);

  const application = await prisma.affiliateApplication.findUnique({
    where: { id },
    select: { id: true, fullName: true, status: true },
  });
  if (!application) return { error: "That application no longer exists." };
  if (application.status !== "pending") return { ok: true };

  await prisma.affiliateApplication.update({
    where: { id: application.id },
    data: { status: "rejected", decidedAt: new Date(), decidedById: admin.id, decisionNote: note },
  });
  await record(null, admin, "application_rejected", `${application.fullName}${note ? ` — ${note}` : ""}`);
  refreshAdmin();
  return { ok: true, message: "Application declined." };
}

// ---------------------------------------------------------------------------
// Affiliates
// ---------------------------------------------------------------------------

/**
 * Suspend or reinstate an affiliate.
 *
 * Suspension stops attribution on new orders and nothing else: commission they
 * have already earned stays theirs, and their console stays open so they can
 * see why. Taking earned money away is a reversal, which is a separate,
 * deliberate act with its own record.
 */
export async function setAffiliateStatus(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !["active", "suspended", "pending"].includes(status)) return;

  const reason = str(fd, "reason").slice(0, 300);
  await prisma.affiliate
    .update({
      where: { id },
      data: {
        status,
        ...(status === "suspended"
          ? { suspendedAt: new Date(), suspendReason: reason }
          : { suspendedAt: null, suspendReason: "", ...(status === "active" ? { approvedAt: new Date() } : {}) }),
      },
    })
    .catch(() => null);

  await record(id, admin, "status_changed", `${status}${reason ? ` — ${reason}` : ""}`);
  refreshAdmin();
  revalidatePath(`/admin/affiliates/${id}`);
}

/**
 * Set an affiliate's own commission floor.
 *
 * It stands in for the programme default on every product that does not name a
 * rate itself — a negotiated rate for somebody who sells a lot. It cannot beat
 * a rate a product names, and it is still subject to the funding caps, so a
 * generous floor cannot make the platform pay more than half its own
 * commission.
 */
export async function setAffiliateRate(_prev: AdminActionState, fd: FormData): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const raw = str(fd, "commissionRate");

  if (raw === "") {
    await prisma.affiliate.update({ where: { id }, data: { commissionRate: null } }).catch(() => null);
    await record(id, admin, "rate_changed", "back to the programme default");
    refreshAdmin();
    return { ok: true, message: "Back to the programme default." };
  }

  const rate = Number(raw);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    return { error: "Enter a rate between 0 and 100." };
  }

  await prisma.affiliate
    .update({ where: { id }, data: { commissionRate: Math.round(rate * 100) / 100 } })
    .catch(() => null);
  await record(id, admin, "rate_changed", `${rate}%`);
  refreshAdmin();
  revalidatePath(`/admin/affiliates/${id}`);
  return { ok: true, message: `Their floor is now ${rate}%.` };
}

// ---------------------------------------------------------------------------
// Product eligibility
// ---------------------------------------------------------------------------

/**
 * Put a product into the programme, or take it out.
 *
 * The cap is enforced here as well as in the rate resolution, because this is
 * where an admin finds out: typing 40% against a product whose platform
 * commission is 10% would silently become 5%, and being told is better than
 * discovering it in a payout a fortnight later.
 */
export async function setProductEligibility(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const action = str(fd, "action");

  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      affiliateEnrolledBy: true,
      category: { select: { commissionRate: true } },
    },
  });
  if (!product) return { error: "That product no longer exists." };

  if (action === "withdraw") {
    await prisma.product.update({
      where: { id },
      data: { affiliateEnabled: false, affiliateEnrolledBy: "", affiliateCommissionRate: null },
    });
    await record(null, admin, "product_withdrawn", product.name);
    updateTag(PRODUCTS_TAG);
    revalidatePath("/admin/affiliates/products");
    return { ok: true, message: `${product.name} is out of the programme.` };
  }

  const funder = str(fd, "enrolledBy") === "seller" ? "seller" : "admin";
  const raw = str(fd, "rate");
  const rate = raw === "" ? null : Number(raw);
  if (rate !== null && (!Number.isFinite(rate) || rate <= 0 || rate > 100)) {
    return { error: "Enter a rate between 0 and 100, or leave it blank to inherit." };
  }

  const defaultCommission = await getCommissionRate();
  const platformCommissionRate = resolveCommissionRate(
    product.category?.commissionRate,
    defaultCommission,
  );
  const ceiling =
    funder === "admin"
      ? maxPlatformFundedRate(platformCommissionRate)
      : maxSellerFundedRate(platformCommissionRate);

  if (rate !== null && rate > ceiling) {
    return {
      error:
        funder === "admin"
          ? `Nickimart funds at most half of its own commission on an item — ${ceiling}% here.`
          : `A seller can fund at most ${ceiling}% on this item, which is what is left after the platform's commission.`,
    };
  }

  await prisma.product.update({
    where: { id },
    data: {
      affiliateEnabled: true,
      affiliateEnrolledBy: funder,
      affiliateCommissionRate: rate === null ? null : Math.round(rate * 100) / 100,
    },
  });
  await record(
    null,
    admin,
    "product_enrolled",
    `${product.name} — ${rate === null ? "inherited rate" : `${rate}%`}, funded by ${funder === "admin" ? "Nickimart" : "the seller"}`,
  );
  updateTag(PRODUCTS_TAG);
  revalidatePath("/admin/affiliates/products");
  return { ok: true, message: `${product.name} is in the programme.` };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

/**
 * Mark a payout paid.
 *
 * The commission lines it claimed become "paid" in the same transaction, which
 * is what stops the same commission being settled twice: a line can only be
 * attached to one payout, and once that payout is paid the line is spent.
 */
export async function payAffiliatePayout(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const reference = str(fd, "reference").slice(0, 120);

  const payout = await prisma.affiliatePayout.findUnique({
    where: { id },
    select: { id: true, affiliateId: true, amount: true, status: true },
  });
  if (!payout) return { error: "That payout request no longer exists." };
  if (payout.status === "paid") return { ok: true };

  const now = new Date();
  await prisma.$transaction([
    prisma.affiliatePayout.update({
      where: { id: payout.id },
      data: {
        status: "paid",
        paidAt: now,
        decidedAt: now,
        decidedById: admin.id,
        reference: reference || undefined,
      },
    }),
    prisma.affiliateCommission.updateMany({
      where: { payoutId: payout.id },
      data: { status: "paid" },
    }),
  ]);

  await record(payout.affiliateId, admin, "payout_paid", `${formatMoney(payout.amount)}${reference ? ` · ${reference}` : ""}`);
  refreshAdmin();
  revalidatePath("/affiliate/earnings");
  return { ok: true, message: `Paid ${formatMoney(payout.amount)}.` };
}

/** Decline a payout request and release the commission it had claimed. */
export async function rejectAffiliatePayout(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const reason = str(fd, "reason").slice(0, 300);
  if (!reason) return { error: "Say why, so the affiliate knows what to do next." };

  const payout = await prisma.affiliatePayout.findUnique({
    where: { id },
    select: { id: true, affiliateId: true, amount: true, status: true },
  });
  if (!payout) return { error: "That payout request no longer exists." };
  if (payout.status === "paid") return { error: "That one has already been paid." };

  await prisma.$transaction([
    // The lines go back to cleared, so the affiliate can ask again.
    prisma.affiliateCommission.updateMany({
      where: { payoutId: payout.id },
      data: { payoutId: null },
    }),
    prisma.affiliatePayout.update({
      where: { id: payout.id },
      data: { status: "rejected", decidedAt: new Date(), decidedById: admin.id, rejectReason: reason },
    }),
  ]);

  await record(payout.affiliateId, admin, "payout_rejected", `${formatMoney(payout.amount)} — ${reason}`);
  refreshAdmin();
  revalidatePath("/affiliate/earnings");
  return { ok: true, message: "Request declined." };
}

/** Move a request into processing, so the affiliate can see it is in hand. */
export async function markPayoutProcessing(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const payout = await prisma.affiliatePayout
    .findUnique({ where: { id }, select: { id: true, affiliateId: true, status: true } })
    .catch(() => null);
  if (!payout || payout.status !== "pending") return;

  await prisma.affiliatePayout.update({ where: { id: payout.id }, data: { status: "processing" } });
  await record(payout.affiliateId, admin, "payout_processing");
  refreshAdmin();
  revalidatePath("/affiliate/earnings");
}

// ---------------------------------------------------------------------------
// Commissions
// ---------------------------------------------------------------------------

/**
 * Take commission back: a return, a refund, a correction.
 *
 * Proportional by default — give back a third of the line's value and a third
 * of the commission comes back — because voiding the whole thing for a partial
 * refund punishes the affiliate for the buyer's change of mind.
 */
export async function reverseCommissionAdmin(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const reason = str(fd, "reason").slice(0, 300);
  if (!reason) return { error: "Say why — this comes off somebody's earnings." };

  const kindRaw = str(fd, "kind");
  const kind = (["refund", "return", "cancellation", "correction", "clawback"] as const).includes(
    kindRaw as never,
  )
    ? (kindRaw as "refund" | "return" | "cancellation" | "correction" | "clawback")
    : "correction";

  const refundedRaw = str(fd, "refundedValue");
  const refundedValue = refundedRaw === "" ? undefined : Number(refundedRaw);
  if (refundedValue !== undefined && (!Number.isFinite(refundedValue) || refundedValue < 0)) {
    return { error: "Enter the amount refunded, or leave it blank to reverse the whole line." };
  }

  const row = await prisma.affiliateCommission
    .findUnique({ where: { id }, select: { affiliateId: true, amount: true } })
    .catch(() => null);
  if (!row) return { error: "That commission line no longer exists." };

  const done = await reverseCommission({
    commissionId: id,
    refundedValue,
    kind,
    reason,
    actorId: admin.id,
  });
  if (!done) return { error: "Nothing to reverse on that line." };

  await record(row.affiliateId, admin, "commission_reversed", `${reason} (${kind})`);
  refreshAdmin();
  revalidatePath("/affiliate/commissions");
  return { ok: true, message: "Commission reversed." };
}

/** Undo a reversal that should not have happened. */
export async function releaseCommissionAdmin(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const reason = str(fd, "reason").slice(0, 300) || "Reversal undone";

  const row = await prisma.affiliateCommission
    .findUnique({ where: { id }, select: { affiliateId: true } })
    .catch(() => null);
  if (!row) return { error: "That commission line no longer exists." };

  const done = await releaseCommission(id, reason, admin.id);
  if (!done) return { error: "That line has nothing reversed on it." };

  await record(row.affiliateId, admin, "commission_released", reason);
  refreshAdmin();
  revalidatePath("/affiliate/commissions");
  return { ok: true, message: "Reversal undone." };
}

// ---------------------------------------------------------------------------
// Abuse
// ---------------------------------------------------------------------------

/**
 * Close an abuse flag.
 *
 * "Cleared" means it was looked at and was nothing; "upheld" means it was
 * real. Upholding does not itself suspend anybody or reverse anything — those
 * are separate acts with their own records — because one flag is rarely the
 * whole story and an automatic punishment would be the wrong kind of certain.
 */
export async function resolveFraudFlag(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !["cleared", "upheld", "open"].includes(status)) return;

  const flag = await prisma.affiliateFraudFlag
    .findUnique({ where: { id }, select: { affiliateId: true, kind: true } })
    .catch(() => null);
  if (!flag) return;

  await prisma.affiliateFraudFlag.update({
    where: { id },
    data: {
      status,
      resolvedAt: status === "open" ? null : new Date(),
      resolvedById: status === "open" ? "" : admin.id,
    },
  });
  await record(flag.affiliateId, admin, "flag_resolved", `${flag.kind} → ${status}`);
  revalidatePath("/admin/affiliates/fraud");
}

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

/**
 * Store a JSON setting.
 *
 * Written straight rather than through the general settings form, because the
 * value is a whole design and the only honest validation is to resolve it the
 * way the drawing will: anything the resolver refuses never reaches the
 * column, so a flyer can never be stored in a state that cannot be drawn.
 */
async function putSetting(key: string, value: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
  updateTag(SETTINGS_TAG);
}

/**
 * The house flyer design.
 *
 * Every affiliate inherits this, part by part: their own design is layered
 * over it rather than replacing it, so changing the house accent here reaches
 * everybody who has not chosen an accent of their own.
 */
export async function saveHouseFlyerDesign(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const raw = str(fd, "design");
  if (!raw) return { error: "Nothing to save." };

  // Resolved before it is stored, so the column only ever holds a design the
  // drawing can read — and so a hand-edited value cannot smuggle in a size
  // that puts the price off the page.
  const design = resolveFlyerDesign(raw);
  await putSetting("affiliateFlyerDesign", JSON.stringify(design));
  await record(null, admin, "flyer_design_changed", "House flyer design updated");

  revalidatePath("/admin/affiliates/branding");
  revalidatePath("/affiliate", "layout");
  return { ok: true, message: "House design saved." };
}

/** The watermark on shared photographs. */
export async function saveAffiliateWatermark(
  _prev: AdminActionState,
  fd: FormData,
): Promise<AdminActionState> {
  const admin = await requireAdmin();
  const raw = str(fd, "watermark");
  if (!raw) return { error: "Nothing to save." };

  const watermark = resolveWatermark(raw);
  await putSetting("affiliateWatermark", JSON.stringify(watermark));
  await record(null, admin, "watermark_changed", watermark.enabled ? watermark.text : "Switched off");

  revalidatePath("/admin/affiliates/branding");
  revalidatePath("/affiliate", "layout");
  return { ok: true, message: "Watermark saved." };
}
