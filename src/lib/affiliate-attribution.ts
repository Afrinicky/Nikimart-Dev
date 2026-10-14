import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { REFERRAL_COOKIE } from "@/lib/affiliate";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import {
  assessReferral,
  attributionExpiry,
  pickAttribution,
  type FraudSignal,
} from "@/lib/affiliate-policy";

/**
 * Who referred this visitor, and whether that still counts.
 *
 * Two cookies do the work. `nikimart_ref` carries the affiliate's code, which
 * is what the old `?ref=` capture wrote and is kept so links already in the
 * wild keep working. `nikimart_vid` is an anonymous visitor id, and it is the
 * one that matters: it keys a row in AffiliateReferral that carries its own
 * expiry, so the attribution outlives a cleared `ref` cookie, survives the
 * visitor clicking a second affiliate's link, and can be reasoned about on the
 * server without trusting anything the browser says about dates.
 *
 * Neither is a secret — a referral code is printed on the flyer — so neither
 * is signed. What is guarded is the *consequence*: the affiliate, the window
 * and the funder are all re-read from the database at checkout, so the worst a
 * forged cookie can do is credit a real affiliate with a real product's real
 * rate, which is what a shared link does anyway.
 */

/** The anonymous visitor id an attribution is keyed on. */
export const VISITOR_COOKIE = "nikimart_vid";

/** A referral code as it may appear in a link. */
const CODE_PATTERN = /^[A-Z0-9]{3,16}$/;
/** A per-product link code, minted by the console. */
const LINK_PATTERN = /^[A-Z0-9]{4,24}$/;

const MAX_AGE_SECONDS = 400 * 86_400; // the browser ceiling; the row decides expiry

export function isReferralCode(value: string): boolean {
  return CODE_PATTERN.test(value.trim().toUpperCase());
}

export function isLinkCode(value: string): boolean {
  return LINK_PATTERN.test(value.trim().toUpperCase());
}

/** A fresh visitor id. Opaque, random, and meaningless outside this table. */
export function newVisitorId(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Enough of an address or a browser string to spot one device farming clicks,
 * and not enough to identify a shopper. Truncated deliberately: a full hash of
 * an IP is still an IP to anybody holding the rainbow table.
 */
function fingerprint(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  return createHash("sha256").update(`nikimart-affiliate:${raw}`).digest("hex").slice(0, 24);
}

/** The caller's address, as far as the proxy chain admits to one. */
function clientIp(h: Headers): string {
  const forwarded = h.get("x-forwarded-for") ?? "";
  return (forwarded.split(",")[0] || h.get("x-real-ip") || "").trim();
}

/**
 * Which social network a click came from.
 *
 * Read off the referer, because the alternative is a `utm_source` the
 * affiliate has to remember to add, and nobody pasting a link into WhatsApp
 * adds anything. WhatsApp sends no referer at all on most platforms, which is
 * itself the signal — a click with no referer on a link that was shared to
 * WhatsApp almost always is one, so it is recorded as "direct" rather than
 * guessed at.
 */
export function channelFromReferer(referer: string, hint?: string | null): string {
  const explicit = (hint ?? "").trim().toLowerCase();
  if (explicit) return explicit.slice(0, 24);
  const value = (referer ?? "").toLowerCase();
  if (!value) return "direct";
  if (value.includes("whatsapp")) return "whatsapp";
  if (value.includes("facebook") || value.includes("fb.")) return "facebook";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("tiktok")) return "tiktok";
  if (value.includes("t.co") || value.includes("twitter") || value.includes("x.com")) return "x";
  if (value.includes("telegram") || value.includes("t.me")) return "telegram";
  if (value.includes("snapchat")) return "snapchat";
  if (value.includes("linkedin")) return "linkedin";
  if (value.includes("google") || value.includes("bing")) return "search";
  return "web";
}

export interface VisitInput {
  /** The affiliate's own code, from `?ref=` or a store-wide link. */
  code?: string | null;
  /** A per-product link code, from `/r/<code>`. */
  linkCode?: string | null;
  /** Where they landed. */
  path?: string;
  channel?: string | null;
  /** An existing visitor id from the cookie, when there is one. */
  visitorId?: string | null;
}

export interface VisitResult {
  affiliateId: string;
  affiliateCode: string;
  /** The visitor id to persist — the one passed in, or a new one. */
  visitorId: string;
  /** Where a product link should land. */
  productSlug: string | null;
  /** How long the attribution runs, for the cookie's own max-age. */
  windowDays: number;
}

/**
 * Record a visit through an affiliate link and start (or extend) the
 * attribution that follows from it.
 *
 * Writes rather than reads, so it belongs to a route handler or an action and
 * never to a render. Everything about it is best-effort except the return
 * value: a click row that fails to insert must not stop the shopper reaching
 * the product they tapped on.
 */
export async function recordAffiliateVisit(input: VisitInput): Promise<VisitResult | null> {
  const policy = await getAffiliatePolicy();
  if (!policy.enabled) return null;

  const linkCode = (input.linkCode ?? "").trim().toUpperCase();
  const code = (input.code ?? "").trim().toUpperCase();

  // A product link resolves to its own row, which is what lets the console
  // answer "which of my links is working".
  const link =
    linkCode && isLinkCode(linkCode)
      ? await prisma.affiliateProduct
          .findUnique({
            where: { linkCode },
            select: {
              id: true,
              affiliateId: true,
              productId: true,
              linkCode: true,
              active: true,
              affiliate: { select: { id: true, code: true, status: true } },
              product: { select: { slug: true, isArchived: true } },
            },
          })
          .catch(() => null)
      : null;

  const affiliate =
    link?.affiliate ??
    (code && isReferralCode(code)
      ? await prisma.affiliate
          .findUnique({ where: { code }, select: { id: true, code: true, status: true } })
          .catch(() => null)
      : null);

  // A suspended affiliate's link still works as a link — refusing to show
  // somebody a product because of a dispute they are not party to would be
  // absurd — it simply stops attributing.
  if (!affiliate || affiliate.status !== "active") return null;

  const visitorId =
    input.visitorId && input.visitorId.length >= 8 && input.visitorId.length <= 64
      ? input.visitorId
      : newVisitorId();

  const h = await headers();
  const referer = h.get("referer") ?? "";
  const now = new Date();
  const expiresAt = attributionExpiry(now, policy.attributionWindowDays);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.affiliateClick.create({
        data: {
          affiliateId: affiliate.id,
          productId: link?.productId ?? null,
          linkCode: link?.linkCode ?? linkCode,
          visitorId,
          channel: channelFromReferer(referer, input.channel),
          path: (input.path ?? "").slice(0, 300),
          referer: referer.slice(0, 300),
          ipHash: fingerprint(clientIp(h)),
          uaHash: fingerprint(h.get("user-agent")),
        },
      });

      if (link) {
        await tx.affiliateProduct.update({
          where: { id: link.id },
          data: { clicks: { increment: 1 } },
        });
      }

      /**
       * The attribution itself.
       *
       * Under last-click the window restarts on every visit, which is what
       * "last click wins" means in practice — the affiliate who brought them
       * back today owns the next thirty days. Under first-click the expiry is
       * left alone, so the clock runs from the first visit and a later click
       * cannot quietly extend somebody else's claim.
       */
      await tx.affiliateReferral.upsert({
        where: { affiliateId_visitorId: { affiliateId: affiliate.id, visitorId } },
        create: {
          affiliateId: affiliate.id,
          visitorId,
          productId: link?.productId ?? null,
          linkCode: link?.linkCode ?? linkCode,
          source: link ? "link" : "code",
          landingPath: (input.path ?? "").slice(0, 300),
          expiresAt,
          windowDays: policy.attributionWindowDays,
          model: policy.attributionModel,
        },
        update: {
          lastSeenAt: now,
          ...(policy.attributionModel === "last"
            ? { expiresAt, windowDays: policy.attributionWindowDays }
            : {}),
          ...(link ? { productId: link.productId, linkCode: link.linkCode } : {}),
        },
      });
    });
  } catch {
    // The tables may not be migrated yet, or the click row may have raced.
    // Neither is a reason to fail the redirect the shopper is waiting on.
  }

  return {
    affiliateId: affiliate.id,
    affiliateCode: affiliate.code ?? code,
    visitorId,
    productSlug: link?.product && !link.product.isArchived ? link.product.slug : null,
    windowDays: policy.attributionWindowDays,
  };
}

/**
 * Write the two cookies a visit leaves behind.
 *
 * Not httpOnly, because the storefront's own `?ref=` capture runs in the
 * browser and has to be able to see what is already set — and because neither
 * value is a secret. `lax` so the cookie survives the cross-site navigation
 * that every single one of these links is.
 */
export async function setReferralCookies(visit: {
  affiliateCode: string;
  visitorId: string;
}): Promise<void> {
  const jar = await cookies();
  const options = {
    path: "/",
    sameSite: "lax" as const,
    maxAge: MAX_AGE_SECONDS,
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  };
  jar.set(REFERRAL_COOKIE, visit.affiliateCode, options);
  jar.set(VISITOR_COOKIE, visit.visitorId, options);
}

// ---------------------------------------------------------------------------
// Checkout
// ---------------------------------------------------------------------------

export interface OrderAttribution {
  /** True when this referral may earn commission on the order. */
  attributed: boolean;
  affiliateId: string;
  affiliateUserId: string | null;
  affiliateCode: string | null;
  referralId: string | null;
  /** The product whose link brought them, when it was a product link. */
  referralProductId: string | null;
  /** The window snapshotted on the attribution, for the ledger. */
  windowDays: number;
  /**
   * The commission percent to use where neither the product nor its category
   * names one: this affiliate's negotiated rate, else the programme default.
   */
  defaultRate: number;
  /** This affiliate's own override, for the ledger's rule-source trail. */
  affiliateOverride: number | null;
  signals: FraudSignal[];
}

export interface CheckoutBuyer {
  id: string;
  email?: string | null;
  phone?: string | null;
}

/**
 * The affiliate this order belongs to, if any, decided here and nowhere else.
 *
 * Every input is re-read from the database: the affiliate's status, their rate,
 * and the window. The cookie's only job is to name a candidate.
 *
 * Returns a verdict rather than null for a referral that was found and
 * refused, because "this order did not earn, and here is why" is a thing both
 * the affiliate and an admin will eventually ask about. The caller records the
 * signals against the order once it exists.
 */
export async function resolveOrderAttribution(
  buyer: CheckoutBuyer,
): Promise<OrderAttribution | null> {
  const policy = await getAffiliatePolicy();
  if (!policy.enabled) return null;

  const jar = await cookies();
  const code = (jar.get(REFERRAL_COOKIE)?.value ?? "").trim().toUpperCase();
  const visitorId = (jar.get(VISITOR_COOKIE)?.value ?? "").trim();

  // Every live attribution on this visitor — by device, and by account, so
  // clicking on a phone and buying on a laptop still credits the referral.
  const referrals = visitorId || buyer.id
    ? await prisma.affiliateReferral
        .findMany({
          where: {
            OR: [...(visitorId ? [{ visitorId }] : []), { userId: buyer.id }],
          },
          orderBy: { lastSeenAt: "desc" },
          take: 20,
          select: {
            id: true,
            affiliateId: true,
            productId: true,
            firstSeenAt: true,
            lastSeenAt: true,
            expiresAt: true,
            windowDays: true,
          },
        })
        .catch(() => [])
    : [];

  const winner = pickAttribution(
    referrals.map((r) => ({
      affiliateId: r.affiliateId,
      firstSeenAt: r.firstSeenAt,
      lastSeenAt: r.lastSeenAt,
      expiresAt: r.expiresAt,
    })),
    policy.attributionModel,
  );

  const chosen = winner ? referrals.find((r) => r.affiliateId === winner.affiliateId) ?? null : null;

  // No attribution row, but a code in the cookie: a link shared before the
  // console existed, or one followed with cookies partly cleared. Honoured, on
  // the window the policy names now, because the alternative is telling an
  // affiliate their old flyers stopped paying.
  const affiliate = chosen
    ? await prisma.affiliate
        .findUnique({
          where: { id: chosen.affiliateId },
          select: { id: true, userId: true, code: true, status: true, commissionRate: true, email: true, phone: true },
        })
        .catch(() => null)
    : code && isReferralCode(code)
      ? await prisma.affiliate
          .findUnique({
            where: { code },
            select: { id: true, userId: true, code: true, status: true, commissionRate: true, email: true, phone: true },
          })
          .catch(() => null)
      : null;

  if (!affiliate) return null;

  const buyerEmail = (buyer.email ?? "").trim().toLowerCase();
  const buyerPhone = (buyer.phone ?? "").replace(/\D/g, "");
  const affiliateEmail = (affiliate.email ?? "").trim().toLowerCase();
  const affiliatePhone = (affiliate.phone ?? "").replace(/\D/g, "");
  const contactMatch =
    (buyerEmail.length > 0 && buyerEmail === affiliateEmail) ||
    (buyerPhone.length >= 9 && buyerPhone === affiliatePhone);

  /**
   * How many referred orders this buyer has already put through this
   * affiliate's links today.
   *
   * Counted on the account rather than the device: the click log carries the
   * hashed address and browser for the admin's fraud screen, but an order
   * carries an account, and an account is the thing a payout is argued over.
   * Ten orders from one buyer on one affiliate's links in a day is either a
   * wholesaler or a scheme, and both are worth a human look.
   */
  const since = new Date(Date.now() - 86_400_000);
  const visitorOrdersToday = await prisma.order
    .count({
      where: {
        affiliateId: affiliate.id,
        userId: buyer.id,
        createdAt: { gte: since },
        status: { not: "cancelled" },
      },
    })
    .catch(() => 0);

  const verdict = assessReferral({
    affiliateUserId: affiliate.userId,
    affiliateStatus: affiliate.status,
    buyerUserId: buyer.id,
    contactMatch,
    expiresAt: chosen?.expiresAt ?? attributionExpiry(new Date(), policy.attributionWindowDays),
    visitorOrdersToday,
    policy,
  });

  const override =
    affiliate.commissionRate != null && affiliate.commissionRate > 0
      ? affiliate.commissionRate
      : null;

  // Tie the attribution to the account now that we know who it is, so the next
  // order from any of their devices still credits the referral.
  if (chosen) {
    await prisma.affiliateReferral
      .update({ where: { id: chosen.id }, data: { userId: buyer.id } })
      .catch(() => {});
  }

  return {
    attributed: verdict.attributed,
    affiliateId: affiliate.id,
    affiliateUserId: affiliate.userId,
    affiliateCode: affiliate.code,
    referralId: chosen?.id ?? null,
    referralProductId: chosen?.productId ?? null,
    windowDays: chosen?.windowDays ?? policy.attributionWindowDays,
    defaultRate: override ?? policy.defaultRate,
    affiliateOverride: override,
    signals: verdict.signals,
  };
}

/** Count an order against the attribution that produced it. */
export async function markReferralConverted(referralId: string | null): Promise<void> {
  if (!referralId) return;
  await prisma.affiliateReferral
    .update({ where: { id: referralId }, data: { orders: { increment: 1 } } })
    .catch(() => {});
}

/** Record what was suspicious about a referral, now that the order exists. */
export async function recordFraudSignals(
  affiliateId: string,
  orderId: string | null,
  signals: FraudSignal[],
): Promise<void> {
  if (signals.length === 0) return;
  await prisma.affiliateFraudFlag
    .createMany({
      data: signals.map((s) => ({
        affiliateId,
        orderId,
        kind: s.kind,
        severity: s.severity,
        detail: s.detail,
      })),
    })
    .catch(() => {});
}
