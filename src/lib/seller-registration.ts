import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import {
  initializeTransaction,
  isPaymentConfigured,
  toPesewas,
  verifyTransaction,
} from "@/lib/payments";
import { callbackOrigin } from "@/lib/site";

/**
 * What it costs to open a shop.
 *
 * Nickimart has always registered sellers for nothing, and the fee defaults to
 * zero, so everything here quietly does nothing until an admin sets a price in
 * Settings. Each programme carries its own: the bundle agents' is set in their
 * console, the affiliates' in theirs, and a shop's here — three prices,
 * because they are three different things to join and nobody would set them to
 * the same number.
 *
 * The fee is snapshotted onto the shop when it registers, so changing the
 * price next month never rewrites what somebody already paid.
 */

export const SELLER_REFERENCE_PREFIX = "SR-";

export function isSellerRegistrationReference(reference: string): boolean {
  return reference.startsWith(SELLER_REFERENCE_PREFIX);
}

function newReference(): string {
  return `${SELLER_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(
    Math.random() * 900 + 100,
  )}`;
}

/** The fee as it stands right now, for a form that is about to quote it. */
export async function getVendorRegistrationFee(): Promise<number> {
  const settings = await getSettings();
  const raw = (settings as unknown as Record<string, string>).vendorRegistrationFee ?? "0";
  const value = Number(raw.trim());
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100) / 100;
}

export interface VendorFeeStatus {
  amount: number;
  paid: boolean;
  /** True when there is a payment for them to make right now. */
  payable: boolean;
}

export function vendorFeeStatus(vendor: {
  registrationFee: number;
  registrationPaidAt: Date | null;
}): VendorFeeStatus {
  const amount = Math.max(0, Math.round(vendor.registrationFee * 100) / 100);
  const paid = amount <= 0 || Boolean(vendor.registrationPaidAt);
  return { amount, paid, payable: !paid };
}

export type StartPaymentResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

/**
 * Begin the registration payment for one shop.
 *
 * A fresh reference each time, because Paystack will not reissue one it has
 * already seen, and the shop id travels in the metadata so settlement reads it
 * from there rather than from the reference on the row. With no Paystack keys
 * configured (local dev, preview) it settles directly, so the flow this gates
 * stays exercisable end to end without a gateway.
 */
export async function startVendorFeePayment(
  vendor: {
    id: string;
    businessName: string;
    registrationFee: number;
    registrationPaidAt: Date | null;
  },
  email: string,
): Promise<StartPaymentResult> {
  const status = vendorFeeStatus(vendor);
  if (status.paid) return { ok: false, error: "Your registration fee is already paid." };

  const reference = newReference();
  await prisma.vendor
    .updateMany({
      where: { id: vendor.id, registrationPaidAt: null },
      data: { registrationReference: reference },
    })
    .catch(() => ({ count: 0 }));

  if (!isPaymentConfigured("retail")) {
    await settleVendorFee(vendor.id, reference);
    return { ok: true, reference };
  }

  try {
    const { authorizationUrl } = await initializeTransaction(
      {
        email,
        amountPesewas: toPesewas(status.amount),
        reference,
        callbackUrl: `${callbackOrigin()}/seller/verify`,
        metadata: {
          kind: "seller-registration-fee",
          vendorId: vendor.id,
          businessName: vendor.businessName,
        },
      },
      "retail",
    );
    return { ok: true, reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

/** The shop id a registration transaction carries, if it carries one. */
export function vendorIdFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).vendorId;
  return typeof value === "string" && value ? value : null;
}

async function findVendor(vendorId: string | null | undefined, reference: string) {
  return vendorId
    ? await prisma.vendor.findUnique({ where: { id: vendorId } }).catch(() => null)
    : await prisma.vendor.findFirst({ where: { registrationReference: reference } }).catch(() => null);
}

/** Confirm a captured amount covers what this shop was quoted. */
export async function vendorFeeCovers(
  reference: string,
  amountPesewas: number,
  vendorId?: string | null,
): Promise<boolean> {
  const vendor = await findVendor(vendorId, reference);
  if (!vendor) return false;
  if (vendor.registrationPaidAt) return true;
  // One pesewa of tolerance absorbs the rounding between our total and the
  // gateway's integer amount.
  return amountPesewas + 1 >= toPesewas(Math.max(0, vendor.registrationFee));
}

/** Mark a shop's registration fee as paid — once. */
export async function settleVendorFee(
  vendorId: string | null,
  reference: string,
): Promise<boolean> {
  const vendor = await findVendor(vendorId, reference);
  if (!vendor) return false;
  if (vendor.registrationPaidAt) return true;

  const done = await prisma.vendor
    .updateMany({
      where: { id: vendor.id, registrationPaidAt: null },
      data: { registrationPaidAt: new Date(), registrationReference: reference },
    })
    .catch(() => ({ count: 0 }));
  return done.count > 0;
}

/** Verify a shop's payment with Paystack and settle it. Used by the redirect. */
export async function verifyAndSettleVendorFee(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "retail");
  if (!result.paid || result.currency !== "GHS") return false;
  const vendorId = vendorIdFromMetadata(result.metadata);
  if (!(await vendorFeeCovers(reference, result.amountPesewas, vendorId))) return false;
  return settleVendorFee(vendorId, reference);
}
