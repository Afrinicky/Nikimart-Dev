import "server-only";
import { initializeTransaction, isPaymentConfigured, toPesewas, verifyTransaction } from "@/lib/payments";
import { callbackOrigin } from "@/lib/site";
import { formatMoney } from "@/lib/format";
import { WALLET_REFERENCE_PREFIX } from "@/lib/data-bundles/reference";
import { round2 } from "@/lib/data-bundles/agent-pricing";
import { DuplicateLedgerEntryError, postLedgerEntry } from "@/lib/data-bundles/agent-ledger";

/**
 * Money *into* the agent wallet, through Paystack.
 *
 * Until now the balance only ever filled up from commission, which meant an
 * agent could not serve a walk-in customer without sending them through a card
 * form for every single bundle. A float they top up once and spend all day is
 * what a data agent actually works with, so this is the other half of paying
 * from the wallet.
 *
 * There is no pending-top-up table. What was paid is what Paystack says was
 * paid — read from the verified transaction or the signed webhook event — and
 * the wallet is credited exactly that. A row saying "GH₵50 expected" could only
 * ever disagree with the gateway, and the disagreement would be somebody's
 * money.
 */

export const MIN_TOPUP = 1;
export const MAX_TOPUP = 10000;

export function newWalletReference(): string {
  return `${WALLET_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export type WalletTopupResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

/** Start a top-up for one agent. The agent id travels in the metadata. */
export async function startWalletTopup(
  agent: { id: string; code: string; storeName: string },
  email: string,
  amount: number,
): Promise<WalletTopupResult> {
  const value = round2(amount);
  if (!Number.isFinite(value) || value < MIN_TOPUP) {
    return { ok: false, error: `The smallest top-up is ${formatMoney(MIN_TOPUP)}.` };
  }
  if (value > MAX_TOPUP) {
    return { ok: false, error: `The largest top-up is ${formatMoney(MAX_TOPUP)}.` };
  }

  const reference = newWalletReference();

  if (!isPaymentConfigured("data")) {
    // No Paystack keys (local dev / preview): credit it directly so spending
    // from the wallet stays exercisable end to end without a gateway.
    await creditWalletTopup(agent.id, reference, value);
    return { ok: true, reference };
  }

  try {
    const { authorizationUrl } = await initializeTransaction(
      {
        email,
        amountPesewas: toPesewas(value),
        reference,
        callbackUrl: `${callbackOrigin()}/agent/verify`,
        metadata: {
          kind: "agent-wallet-topup",
          agentId: agent.id,
          agentCode: agent.code,
          storeName: agent.storeName,
        },
      },
      "data",
    );
    return { ok: true, reference, authorizationUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

/**
 * Credit a settled top-up — once per reference.
 *
 * The dedupe key is the reference, so the redirect the agent lands on and the
 * webhook Paystack sends can both call this and the money lands once.
 */
export async function creditWalletTopup(
  agentId: string,
  reference: string,
  amount: number,
): Promise<boolean> {
  const value = round2(amount);
  if (value <= 0) return false;

  try {
    await postLedgerEntry({
      agentId,
      type: "WALLET_TOPUP",
      amount: value,
      narration: `Wallet top-up — ${formatMoney(value)} (ref ${reference})`,
      reference,
      dedupeKey: `WALLET_TOPUP:${reference}`,
    });
    return true;
  } catch (err) {
    // Already credited by whichever of the two callers got here first.
    if (err instanceof DuplicateLedgerEntryError) return true;
    return false;
  }
}

/** The agent id a wallet transaction carries, if it carries one. */
export function walletAgentFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).agentId;
  return typeof value === "string" && value ? value : null;
}

/**
 * Settle a top-up from a signed webhook event: whatever was captured is what
 * is credited, so there is nothing for an amount check to compare against —
 * only the agent has to be identifiable.
 */
export async function settleWalletTopup(
  reference: string,
  amountPesewas: number,
  metadata: unknown,
): Promise<boolean> {
  const agentId = walletAgentFromMetadata(metadata);
  if (!agentId) {
    console.warn(`[wallet] top-up ${reference} carried no agent id — not credited.`);
    return false;
  }
  return creditWalletTopup(agentId, reference, amountPesewas / 100);
}

/** Verify a top-up with Paystack and credit it. Used by the agent's redirect. */
export async function verifyAndSettleWalletTopup(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "data");
  if (!result.paid || result.currency !== "GHS") return false;
  return settleWalletTopup(reference, result.amountPesewas, result.metadata);
}
