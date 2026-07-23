import "server-only";

/**
 * Paystack integration (server-only). The secret key must never reach the
 * browser — a leak lets anyone charge/refund on the account. When the key is
 * absent (e.g. local dev before keys are added), `isPaymentConfigured()`
 * returns false and callers fall back to the simulated "mark as paid" flow.
 *
 * Amounts are handled in the smallest currency unit (pesewas): GHS × 100.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

export function paystackSecretKey(): string | undefined {
  const key = process.env.PAYSTACK_SECRET_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

/** True when Paystack is configured and real payments should be collected. */
export function isPaymentConfigured(): boolean {
  return Boolean(paystackSecretKey());
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
export async function initializeTransaction(params: InitializeParams): Promise<InitializeResult> {
  const secret = paystackSecretKey();
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
}

/** Verify a transaction by reference (server-side source of truth). */
export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  const secret = paystackSecretKey();
  if (!secret) throw new Error("Paystack is not configured.");

  const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string; amount?: number; currency?: string };
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
  };
}
