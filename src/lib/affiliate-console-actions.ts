"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getAffiliateForUser, generateAffiliateCode } from "@/lib/affiliate";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { admissionRoute } from "@/lib/affiliate-policy";
import { getLedgerBalance } from "@/lib/affiliate-ledger";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { formatMoney } from "@/lib/format";
import { MAX_BULK_SHARE, resolveFlyerDesign } from "@/lib/affiliate-flyer";
import { getHouseBranding } from "@/lib/affiliate-branding";

/**
 * What an affiliate can do from their own console.
 *
 * Every action here re-reads the affiliate from the signed-in user rather than
 * taking an id from the form. A console is a page in a browser, and the one
 * thing a browser must never be able to say is which account it is acting for.
 */

export type ActionState = { ok?: boolean; error?: string; message?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** The affiliate account for the signed-in user, or an error state. */
async function requireAffiliate() {
  const user = await requireUser();
  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: user.id },
    select: { id: true, code: true, status: true, shareMessage: true, flyerTheme: true },
  });
  return { user, affiliate };
}

/** A short, unambiguous link code. No vowels, so none of them spell anything. */
function newLinkCode(): string {
  const alphabet = "BCDFGHJKLMNPQRSTVWXYZ23456789";
  const bytes = randomBytes(8);
  let code = "";
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code;
}

function record(affiliateId: string | null, actorId: string, action: string, detail = "") {
  return prisma.affiliateEvent
    .create({ data: { affiliateId, actorId, action, detail: detail.slice(0, 500) } })
    .catch(() => null);
}

// ---------------------------------------------------------------------------
// Joining
// ---------------------------------------------------------------------------

/**
 * Join the programme, or ask to.
 *
 * A seller or a bundle agent is admitted on the spot when the admin has left
 * auto-approval on: they have been verified once already, and a form asking
 * them about their following before they can share the catalogue they are
 * already selling on is friction with no decision behind it. Everybody else
 * files an application, which lands in the admin's queue.
 */
export async function joinAffiliateProgramme(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const existing = await getAffiliateForUser(user.id);
  if (existing) return { ok: true };

  const [policy, vendor, agent] = await Promise.all([
    getAffiliatePolicy(),
    prisma.vendor.findUnique({ where: { ownerId: user.id }, select: { id: true } }).catch(() => null),
    getAgentForUser(user.id),
  ]);

  const standing = {
    isSeller: Boolean(vendor) || user.role === "SELLER",
    isAgent: Boolean(agent),
    isAdmin: user.role === "ADMIN",
  };
  const route = admissionRoute(standing, policy);

  if (route === "closed") {
    return { error: "The affiliate programme isn't open for new members right now." };
  }

  const name = str(fd, "fullName") || user.name || "Affiliate";
  const phone = str(fd, "phone");
  const desired = str(fd, "code").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 12);

  if (route === "apply") {
    const open = await prisma.affiliateApplication
      .findFirst({ where: { userId: user.id, status: "pending" }, select: { id: true } })
      .catch(() => null);
    if (open) return { ok: true, message: "Your application is already with us." };

    const channels = fd.getAll("channels").map((c) => String(c)).filter(Boolean).slice(0, 12);
    try {
      await prisma.affiliateApplication.create({
        data: {
          userId: user.id,
          fullName: name,
          phone,
          email: user.email ?? "",
          channels: JSON.stringify(channels),
          audience: str(fd, "audience").slice(0, 200),
          note: str(fd, "note").slice(0, 1000),
          desiredCode: desired,
        },
      });
    } catch {
      return { error: "Couldn't send your application. Please try again." };
    }
    await record(null, user.id, "application_submitted", name);
    revalidatePath("/affiliate");
    return { ok: true, message: "Application sent — we'll be in touch shortly." };
  }

  // Straight in.
  const clash = desired
    ? await prisma.affiliate.findUnique({ where: { code: desired }, select: { id: true } })
    : null;
  const code = desired && !clash ? desired : await generateAffiliateCode(user.name ?? "");

  try {
    const created = await prisma.affiliate.create({
      data: {
        userId: user.id,
        name,
        email: user.email ?? "",
        phone,
        code,
        status: "active",
        source: standing.isAgent ? "agent" : standing.isSeller ? "seller" : "self",
        approvedAt: new Date(),
      },
      select: { id: true },
    });
    await record(created.id, user.id, "affiliate_created", `Auto-admitted (${code})`);
  } catch {
    return { error: "Couldn't set up your affiliate account. Please try again." };
  }
  revalidatePath("/affiliate");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The product list
// ---------------------------------------------------------------------------

/**
 * Add a product to the affiliate's list and mint its link.
 *
 * Any active listing can be added, enrolled or not. Adding one that pays
 * nothing yet is a reasonable thing to want — it is a shortlist, and the
 * console shows plainly which rows earn — so the only refusal here is a
 * product that is not on the storefront at all.
 */
export async function addPromotedProduct(fd: FormData): Promise<void> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return;

  const productId = str(fd, "productId");
  if (!productId) return;

  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, isArchived: true },
  });
  if (!product || product.isArchived) return;

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await prisma.affiliateProduct.create({
        data: { affiliateId: affiliate.id, productId, linkCode: newLinkCode() },
      });
      await record(affiliate.id, user.id, "product_added", product.name);
      break;
    } catch {
      // Either the link code collided — try again — or it is already on the
      // list, which is the outcome the person asked for anyway.
      const already = await prisma.affiliateProduct
        .findUnique({
          where: { affiliateId_productId: { affiliateId: affiliate.id, productId } },
          select: { id: true },
        })
        .catch(() => null);
      if (already) break;
    }
  }

  revalidateConsole(fd);
}

/**
 * Make sure every one of these products is on the list, and hand back the link
 * for each.
 *
 * What "share these five" needs: five links that track. Adding them one at a
 * time from the browser would be five round trips and a half-done list if one
 * of them failed, so this is one call that is safe to repeat — a product
 * already on the list keeps the link it already has.
 */
export async function ensurePromotedProducts(
  productIds: string[],
): Promise<Record<string, string>> {
  const { affiliate } = await requireAffiliate();
  if (!affiliate) return {};

  const ids = [...new Set(productIds.filter(Boolean))].slice(0, MAX_BULK_SHARE);
  if (ids.length === 0) return {};

  // Only listings that are actually on the storefront; an archived one would
  // mint a link to a page nobody can buy from.
  const products = await prisma.product
    .findMany({ where: { id: { in: ids }, isArchived: false }, select: { id: true } })
    .catch(() => [] as { id: string }[]);

  const existing = await prisma.affiliateProduct
    .findMany({
      where: { affiliateId: affiliate.id, productId: { in: products.map((p) => p.id) } },
      select: { productId: true, linkCode: true },
    })
    .catch(() => [] as { productId: string; linkCode: string }[]);

  const codes = new Map(existing.map((e) => [e.productId, e.linkCode]));

  for (const product of products) {
    if (codes.has(product.id)) continue;
    for (let attempt = 0; attempt < 5; attempt++) {
      const linkCode = newLinkCode();
      try {
        await prisma.affiliateProduct.create({
          data: { affiliateId: affiliate.id, productId: product.id, linkCode },
        });
        codes.set(product.id, linkCode);
        break;
      } catch {
        // Either the code collided — try another — or it was added in the
        // meantime, in which case its own code is the one to use.
        const row = await prisma.affiliateProduct
          .findUnique({
            where: { affiliateId_productId: { affiliateId: affiliate.id, productId: product.id } },
            select: { linkCode: true },
          })
          .catch(() => null);
        if (row) {
          codes.set(product.id, row.linkCode);
          break;
        }
      }
    }
  }

  revalidatePath("/affiliate/products");
  return Object.fromEntries(codes);
}

/** Note that a batch went out, so the list's "last shared" is honest. */
export async function recordBulkShare(productIds: string[]): Promise<void> {
  const { affiliate } = await requireAffiliate();
  if (!affiliate) return;
  const ids = [...new Set(productIds.filter(Boolean))].slice(0, MAX_BULK_SHARE);
  if (ids.length === 0) return;

  const now = new Date();
  await Promise.all([
    prisma.affiliateProduct
      .updateMany({
        where: { affiliateId: affiliate.id, productId: { in: ids } },
        data: { lastSharedAt: now },
      })
      .catch(() => null),
    prisma.affiliate
      .update({ where: { id: affiliate.id }, data: { lastSharedAt: now } })
      .catch(() => null),
  ]);
}

/** Take a product off the list. Its history stays in the ledger. */
export async function removePromotedProduct(fd: FormData): Promise<void> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return;
  const productId = str(fd, "productId");
  if (!productId) return;

  await prisma.affiliateProduct
    .delete({ where: { affiliateId_productId: { affiliateId: affiliate.id, productId } } })
    .catch(() => null);
  await record(affiliate.id, user.id, "product_removed", productId);
  revalidateConsole(fd);
}

/** Pause or resume one link without losing it. */
export async function togglePromotedProduct(fd: FormData): Promise<void> {
  const { affiliate } = await requireAffiliate();
  if (!affiliate) return;
  const id = str(fd, "id");
  if (!id) return;

  const row = await prisma.affiliateProduct.findFirst({
    where: { id, affiliateId: affiliate.id },
    select: { id: true, active: true },
  });
  if (!row) return;
  await prisma.affiliateProduct.update({ where: { id: row.id }, data: { active: !row.active } });
  revalidateConsole(fd);
}

/** Save the caption and colourway for one product's flyer. */
export async function savePromotedProduct(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { affiliate } = await requireAffiliate();
  if (!affiliate) return { error: "You're not an affiliate yet." };

  const id = str(fd, "id");
  const row = await prisma.affiliateProduct.findFirst({
    where: { id, affiliateId: affiliate.id },
    select: { id: true },
  });
  if (!row) return { error: "That product isn't on your list." };

  await prisma.affiliateProduct.update({
    where: { id: row.id },
    data: {
      shareMessage: str(fd, "shareMessage").slice(0, 600),
      flyerTheme: str(fd, "flyerTheme").slice(0, 24),
    },
  });
  revalidatePath("/affiliate/products");
  return { ok: true, message: "Saved." };
}

/**
 * Note that a flyer went out.
 *
 * Called from the share button, which is the only moment anybody knows a post
 * was actually made — the click that follows is the customer's, hours later.
 * Best effort: a share that fails to record is still a share.
 */
export async function recordAffiliateShare(fd: FormData): Promise<void> {
  const { affiliate } = await requireAffiliate();
  if (!affiliate) return;
  const id = str(fd, "id");
  const now = new Date();
  await Promise.all([
    id
      ? prisma.affiliateProduct
          .updateMany({ where: { id, affiliateId: affiliate.id }, data: { lastSharedAt: now } })
          .catch(() => null)
      : null,
    prisma.affiliate.update({ where: { id: affiliate.id }, data: { lastSharedAt: now } }).catch(() => null),
  ]);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** The affiliate's own details: how they are paid, and what they say. */
export async function saveAffiliateProfile(
  _prev: ActionState,
  fd: FormData,
): Promise<ActionState> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return { error: "You're not an affiliate yet." };

  const method = str(fd, "payoutMethod");
  if (method && !["momo", "bank"].includes(method)) {
    return { error: "Choose Mobile Money or a bank account." };
  }
  const number = str(fd, "payoutNumber");
  if (method && !number) return { error: "Add the number your payout should go to." };

  try {
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        name: str(fd, "name").slice(0, 120) || undefined,
        phone: str(fd, "phone").slice(0, 32),
        shareMessage: str(fd, "shareMessage").slice(0, 600),
        flyerTheme: str(fd, "flyerTheme").slice(0, 24),
        payoutMethod: method,
        payoutName: str(fd, "payoutName").slice(0, 120),
        payoutNumber: number.slice(0, 64),
        payoutNetwork: str(fd, "payoutNetwork").slice(0, 64),
      },
    });
  } catch {
    return { error: "Couldn't save your details. Please try again." };
  }
  await record(affiliate.id, user.id, "profile_updated");
  revalidatePath("/affiliate/settings");
  revalidatePath("/affiliate");
  return { ok: true, message: "Saved." };
}

/**
 * Choose a referral code.
 *
 * Only before the first click. A code is printed on flyers and pasted into
 * bios; changing it afterwards breaks links the affiliate has no way of
 * recalling, and silently stops paying them. So it is offered exactly once,
 * while nothing depends on it.
 */
export async function setAffiliateCode(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return { error: "You're not an affiliate yet." };

  const wanted = str(fd, "code").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (wanted.length < 4 || wanted.length > 12) {
    return { error: "Use 4–12 letters and numbers." };
  }
  if (wanted === affiliate.code) return { ok: true };

  const [clicks, orders] = await Promise.all([
    prisma.affiliateClick.count({ where: { affiliateId: affiliate.id } }).catch(() => 0),
    prisma.order.count({ where: { affiliateId: affiliate.id } }).catch(() => 0),
  ]);
  if (clicks > 0 || orders > 0) {
    return {
      error:
        "Your code is already out there on links people have followed, so it can't be changed — that would stop those links paying you.",
    };
  }

  const clash = await prisma.affiliate.findUnique({ where: { code: wanted }, select: { id: true } });
  if (clash) return { error: "That code is taken. Try another." };

  await prisma.affiliate.update({ where: { id: affiliate.id }, data: { code: wanted } });
  await record(affiliate.id, user.id, "code_changed", wanted);
  revalidatePath("/affiliate/settings");
  return { ok: true, message: `Your code is now ${wanted}.` };
}

// ---------------------------------------------------------------------------
// Payouts
// ---------------------------------------------------------------------------

/**
 * Ask to be paid.
 *
 * The amount is checked against the ledger, not against a figure from the
 * form, and only one request may be open at a time — without that, two
 * submissions racing the balance check would both pass and together claim
 * more than has cleared. The commission lines being claimed are attached to
 * the request, so what was paid for can always be shown.
 */
export async function requestPayout(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return { error: "You're not an affiliate yet." };
  if (affiliate.status !== "active") {
    return { error: "Your affiliate account is on hold, so payouts are paused." };
  }

  const policy = await getAffiliatePolicy();
  const balance = await getLedgerBalance(affiliate.id);

  const wanted = Number(str(fd, "amount"));
  const amount = Math.round((Number.isFinite(wanted) ? wanted : 0) * 100) / 100;
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (amount > balance.available + 0.005) {
    return { error: `You can request up to ${formatMoney(balance.available)}.` };
  }
  if (amount < policy.minPayout) {
    return { error: `The smallest payout is ${formatMoney(policy.minPayout)}.` };
  }

  const details = await prisma.affiliate.findUnique({
    where: { id: affiliate.id },
    select: { payoutMethod: true, payoutName: true, payoutNumber: true, payoutNetwork: true },
  });
  if (!details?.payoutNumber) {
    return { error: "Add your payout details in Settings first, so we know where to send it." };
  }

  try {
    const open = await prisma.affiliatePayout.findFirst({
      where: { affiliateId: affiliate.id, status: { in: ["pending", "processing"] } },
      select: { id: true },
    });
    if (open) return { error: "You already have a payout request awaiting review." };

    // The lines this request is against: oldest cleared first, up to the
    // amount asked for. Attaching them is what makes a payout auditable —
    // and what stops the same commission being claimed twice.
    const cleared = await prisma.affiliateCommission.findMany({
      where: { affiliateId: affiliate.id, status: "cleared", payoutId: null },
      orderBy: { clearedAt: "asc" },
      select: { id: true, amount: true, reversedAmount: true },
    });

    const claimed: string[] = [];
    let running = 0;
    for (const line of cleared) {
      if (running >= amount - 0.005) break;
      claimed.push(line.id);
      running += Math.max(0, line.amount - line.reversedAmount);
    }

    const payout = await prisma.affiliatePayout.create({
      data: {
        affiliateId: affiliate.id,
        amount,
        status: "pending",
        method: details.payoutMethod === "bank" ? "Bank transfer" : "Mobile Money",
        accountName: details.payoutName,
        accountNumber: details.payoutNumber,
        network: details.payoutNetwork,
        note: str(fd, "note").slice(0, 300) || "Requested by affiliate",
      },
      select: { id: true },
    });

    if (claimed.length > 0) {
      await prisma.affiliateCommission.updateMany({
        where: { id: { in: claimed } },
        data: { payoutId: payout.id },
      });
    }
    await record(affiliate.id, user.id, "payout_requested", formatMoney(amount));
  } catch {
    return { error: "Couldn't submit your request. Please try again." };
  }

  revalidatePath("/affiliate/earnings");
  revalidatePath("/affiliate");
  revalidatePath("/admin/affiliates/payouts");
  return { ok: true, message: "Payout requested." };
}

/** Withdraw a request that hasn't been decided yet. */
export async function cancelPayoutRequest(fd: FormData): Promise<void> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return;
  const id = str(fd, "id");

  const payout = await prisma.affiliatePayout.findFirst({
    where: { id, affiliateId: affiliate.id, status: "pending" },
    select: { id: true, amount: true },
  });
  if (!payout) return;

  await prisma.$transaction([
    // The lines go back to cleared so they can be claimed again.
    prisma.affiliateCommission.updateMany({
      where: { payoutId: payout.id },
      data: { payoutId: null },
    }),
    prisma.affiliatePayout.update({
      where: { id: payout.id },
      data: { status: "rejected", rejectReason: "Withdrawn by the affiliate", decidedAt: new Date() },
    }),
  ]);
  await record(affiliate.id, user.id, "payout_withdrawn", formatMoney(payout.amount));
  revalidatePath("/affiliate/earnings");
}

/**
 * Refresh whichever console screen the form was submitted from.
 *
 * The product list is reachable from four places — the catalogue, the shop
 * view, a product page, the list itself — and revalidating all of them on
 * every add was four cache drops for one change.
 */
function revalidateConsole(fd: FormData): void {
  const from = String(fd.get("from") ?? "").trim();
  revalidatePath("/affiliate/products");
  if (from.startsWith("/affiliate")) revalidatePath(from);
  else revalidatePath("/affiliate/catalogue");
}

// ---------------------------------------------------------------------------
// Their own flyer
// ---------------------------------------------------------------------------

/**
 * Save this affiliate's flyer design.
 *
 * Resolved against the *house* design before it is stored, so what is kept is
 * a complete, drawable design — and so anything the resolver refuses never
 * reaches the column. Clearing it is a separate action rather than saving an
 * empty value, because "take me back to the house style" and "I have designed
 * something that happens to match it" are different intentions, and only the
 * first should keep following the admin's future changes.
 */
export async function saveFlyerDesign(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return { error: "You're not an affiliate yet." };

  const raw = str(fd, "design");
  if (!raw) return { error: "Nothing to save." };

  const house = await getHouseBranding();
  const design = resolveFlyerDesign(raw, house.house);

  try {
    await prisma.affiliate.update({
      where: { id: affiliate.id },
      // The colourway is part of the design now, so the studio's own
      // remembered theme is cleared — otherwise it would keep overriding the
      // one they have just chosen here.
      data: { flyerDesign: JSON.stringify(design), flyerTheme: "" },
    });
  } catch {
    return { error: "Couldn't save your design. Please try again." };
  }

  await record(affiliate.id, user.id, "flyer_design_changed", "Own flyer design saved");
  revalidatePath("/affiliate/settings/flyer");
  revalidatePath("/affiliate/products");
  return { ok: true, message: "Your design is saved." };
}

/** Go back to the house style, and keep following it from then on. */
export async function clearFlyerDesign(fd: FormData): Promise<void> {
  const { user, affiliate } = await requireAffiliate();
  if (!affiliate) return;
  void fd;

  await prisma.affiliate
    .update({ where: { id: affiliate.id }, data: { flyerDesign: "", flyerTheme: "" } })
    .catch(() => null);
  await record(affiliate.id, user.id, "flyer_design_changed", "Back to the house design");
  revalidatePath("/affiliate/settings/flyer");
}
