import "server-only";

/**
 * Paystack integration (server-only). The secret key must never reach the
 * browser — a leak lets anyone charge/refund on the account. When the key is
 * absent (e.g. local dev before keys are added), `isPaymentConfigured()`
 * returns false and callers fall back to the simulated "mark as paid" flow.
 *
 * Amounts are handled in the smallest currency unit (pesewas): GHS × 100.
 *
 * Two accounts, not one
 * ---------------------
 * The mall and the bundle business settle into different Paystack accounts, so
 * every call here says which one it is acting for. It is not a preference: the
 * money from a bundle sale and the money from a mall order belong to different
 * ledgers, and with one account they arrive in one payout that nobody can split
 * afterwards.
 *
 *   "data"   — the bundle storefront, agent storefronts and AFA registrations.
 *              PAYSTACK_SECRET_KEY, unchanged, because this is the account that
 *              has always taken those payments.
 *   "retail"  — the mall. RETAIL_PAYSTACK_SECRET_KEY.
 *
 * Retail falls back to PAYSTACK_SECRET_KEY when its own key is not set, so an
 * environment that has not been given the second account keeps taking payments
 * exactly as it did. Setting RETAIL_PAYSTACK_SECRET_KEY is what separates them,
 * and nothing else has to change on the day it is set.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

// The business a charge belongs to, and the rule for who may settle it, live in
// lib/payment-routing — pure, so they can be tested without a secret in sight.
export type { PaymentAccount } from "@/lib/payment-routing";
import type { PaymentAccount } from "@/lib/payment-routing";

export function paystackSecretKey(account: PaymentAccount): string | undefined {
  const raw =
    account === "retail"
      ? process.env.RETAIL_PAYSTACK_SECRET_KEY?.trim() || process.env.PAYSTACK_SECRET_KEY
      : process.env.PAYSTACK_SECRET_KEY;
  return raw && raw.trim() ? raw.trim() : undefined;
}

/** One configured key, and every business it settles for. */
export interface PaystackSigner {
  secret: string;
  /**
   * Usually one business. Both when a single key serves both — which is the
   * case until RETAIL_PAYSTACK_SECRET_KEY is set, and the reason this is a list
   * rather than a single account: a shared key legitimately settles either
   * side, and recording it against only the first would have the webhook drop
   * every charge belonging to the second.
   */
  accounts: PaymentAccount[];
}

/**
 * Every distinct key that is configured, with the businesses each one settles
 * for. The webhook checks a signature against each in turn to find which key
 * signed an event, and then what that key is allowed to settle.
 */
export function paystackAccounts(): PaystackSigner[] {
  const bySecret = new Map<string, PaystackSigner>();
  for (const account of ["retail", "data"] as const) {
    const secret = paystackSecretKey(account);
    if (!secret) continue;
    const existing = bySecret.get(secret);
    if (existing) existing.accounts.push(account);
    else bySecret.set(secret, { secret, accounts: [account] });
  }
  return [...bySecret.values()];
}

/** True when this account is configured and real payments should be collected. */
export function isPaymentConfigured(account: PaymentAccount): boolean {
  return Boolean(paystackSecretKey(account));
}

/** Convert a Cedi amount to integer pesewas for the Paystack API. */
export function toPesewas(amountGhs: number): number {
  return Math.round(amountGhs * 100);
}

export interface InitializeParams {
  email: string;
  /** Amount in pesewas (GHS × 100). */
  amountPesewas: number;
  /** Unique transaction reference — we use the order number. */
  reference: string;
  /** Absolute URL Paystack redirects to after payment. */
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/**
 * Start a Paystack transaction. Returns the hosted checkout URL to redirect the
 * buyer to (Mobile Money for MTN/Telecel/AirtelTigo + cards). Throws on failure.
 */
export async function initializeTransaction(
  params: InitializeParams,
  account: PaymentAccount,
): Promise<InitializeResult> {
  const secret = paystackSecretKey(account);
  if (!secret) throw new Error("Paystack is not configured.");

  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountPesewas,
      currency: "GHS",
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata ?? {},
      channels: ["mobile_money", "card"],
    }),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string; access_code?: string; reference?: string };
  } | null;

  if (!res.ok || !json?.status || !json.data?.authorization_url) {
    throw new Error(json?.message || "Could not start the payment. Please try again.");
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code ?? "",
    reference: json.data.reference ?? params.reference,
  };
}

export interface VerifyResult {
  /** Paystack status: "success", "failed", "abandoned", etc. */
  status: string;
  reference: string;
  /** Amount actually paid, in pesewas. */
  amountPesewas: number;
  currency: string;
  paid: boolean;
  /**
   * Whatever was attached when the transaction was started. It is how a payment
   * says what it was for when the reference alone is not enough to find it —
   * an agent's registration fee, most of all, where a retry mints a new
   * reference and the old link must still settle to the right account.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Verify a transaction by reference (server-side source of truth).
 *
 * It has to be asked of the account that took the charge: Paystack does not
 * know a reference that belongs to somebody else's account and would report a
 * paid order as unknown.
 */
export async function verifyTransaction(
  reference: string,
  account: PaymentAccount,
): Promise<VerifyResult> {
  const secret = paystackSecretKey(account);
  if (!secret) throw new Error("Paystack is not configured.");

  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: {
      status?: string;
      reference?: string;
      amount?: number;
      currency?: string;
      metadata?: Record<string, unknown>;
    };
  } | null;

  if (!res.ok || !json?.status || !json.data) {
    throw new Error(json?.message || "Could not verify the payment.");
  }

  const status = json.data.status ?? "unknown";
  return {
    status,
    reference: json.data.reference ?? reference,
    amountPesewas: json.data.amount ?? 0,
    currency: json.data.currency ?? "GHS",
    paid: status === "success",
    metadata: json.data.metadata,
  };
}
