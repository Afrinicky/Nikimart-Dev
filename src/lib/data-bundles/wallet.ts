import "server-only";
import { dataDb } from "@/lib/data-db";
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
 * Every top-up is written down before the agent is handed to Paystack. That
 * ordering is the whole design. The first version kept no record at all — the
 * reference went to Paystack with the agent id in the transaction metadata, and
 * settlement depended on a callback or a webhook reaching code that understood
 * it. When one didn't (the return URL is the canonical domain, so a payment
 * started on a preview deployment comes back to production, which may not have
 * shipped the feature yet) the money was captured, nothing was credited, and
 * there was nothing on our side that even knew a top-up had been attempted.
 *
 * Now: the row exists first, settlement resolves the agent from the row before
 * it looks at metadata, the agent can re-check a payment themselves, and the
 * nightly sweep re-checks anything still pending against Paystack. What is
 * credited is always what Paystack says was captured, never what was asked for.
 */

export const MIN_TOPUP = 1;
export const MAX_TOPUP = 10000;
/** Give the redirect and the webhook a moment before the sweep chases a row. */
const SWEEP_AFTER_MS = 3 * 60_000;
/** After this, an unpaid top-up is a checkout somebody walked away from. */
const ABANDON_AFTER_MS = 24 * 60 * 60_000;

export function newWalletReference(): string {
  return `${WALLET_REFERENCE_PREFIX}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
}

export type WalletTopupResult =
  | { ok: true; reference: string; authorizationUrl?: string }
  | { ok: false; error: string };

export interface PendingTopup {
  reference: string;
  amount: number;
  createdAt: Date;
}

/** Start a top-up for one agent, recorded before they ever reach the gateway. */
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
  // Before the gateway, always. A row that exists without a payment is a
  // checkout somebody abandoned; a payment that exists without a row is money
  // nobody can find.
  await dataDb.dataWalletTopup
    .create({ data: { agentId: agent.id, reference, amount: value } })
    .catch(() => null); // table not migrated yet — settlement still works by metadata

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
    await dataDb.dataWalletTopup.deleteMany({ where: { reference } }).catch(() => {});
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not start the payment. Please try again.",
    };
  }
}

/**
 * Credit a settled top-up — once per reference.
 *
 * The dedupe key is the reference, so the redirect the agent lands on, the
 * webhook Paystack sends and the sweep can all call this and the money lands
 * once. The row is stamped either way: a credit that was already posted still
 * has to stop the row looking unsettled.
 */
export async function creditWalletTopup(
  agentId: string,
  reference: string,
  amount: number,
): Promise<boolean> {
  const value = round2(amount);
  if (value <= 0) return false;

  let credited = false;
  try {
    await postLedgerEntry({
      agentId,
      type: "WALLET_TOPUP",
      amount: value,
      narration: `Wallet top-up — ${formatMoney(value)} (ref ${reference})`,
      reference,
      dedupeKey: `WALLET_TOPUP:${reference}`,
    });
    credited = true;
  } catch (err) {
    // Already credited by whichever of the callers got here first.
    if (!(err instanceof DuplicateLedgerEntryError)) return false;
    credited = true;
  }

  await dataDb.dataWalletTopup
    .updateMany({
      where: { reference, status: { not: "paid" } },
      data: { status: "paid", creditedAmount: value, paidAt: new Date() },
    })
    .catch(() => {});

  return credited;
}

/** The agent id a wallet transaction carries, if it carries one. */
export function walletAgentFromMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const value = (metadata as Record<string, unknown>).agentId;
  return typeof value === "string" && value ? value : null;
}

/**
 * Whose top-up this is: the row we wrote before the payment started, and only
 * then the transaction metadata. The row is the stronger answer — it is ours,
 * it cannot be replayed without it, and it survives a gateway that hands the
 * metadata back empty.
 */
async function agentForTopup(reference: string, metadata?: unknown): Promise<string | null> {
  const row = await dataDb.dataWalletTopup
    .findUnique({ where: { reference }, select: { agentId: true } })
    .catch(() => null);
  return row?.agentId ?? walletAgentFromMetadata(metadata);
}

/**
 * Settle a top-up from a signed webhook event: whatever was captured is what
 * is credited, so there is nothing for an amount check to compare against —
 * only the agent has to be identifiable.
 */
export async function settleWalletTopup(
  reference: string,
  amountPesewas: number,
  metadata?: unknown,
): Promise<boolean> {
  const agentId = await agentForTopup(reference, metadata);
  if (!agentId) {
    console.warn(`[wallet] top-up ${reference} matched no agent — not credited.`);
    return false;
  }
  return creditWalletTopup(agentId, reference, amountPesewas / 100);
}

export type ReconcileResult =
  | { ok: true; credited: number; message: string }
  | { ok: false; error: string };

/**
 * Ask Paystack about one reference and credit it if it was paid.
 *
 * This is the recovery path, and it is deliberately usable from three places —
 * the agent's own "I paid but it isn't showing" button, the admin console, and
 * the sweep — because the failure it recovers from (money captured, nothing
 * credited) is the one a person is standing in front of you about.
 */
export async function reconcileWalletTopup(
  reference: string,
  opts: { agentId?: string | null } = {},
): Promise<ReconcileResult> {
  const ref = reference.trim().toUpperCase();
  if (!ref.startsWith(WALLET_REFERENCE_PREFIX)) {
    return { ok: false, error: `A wallet top-up reference starts with ${WALLET_REFERENCE_PREFIX}.` };
  }

  const row = await dataDb.dataWalletTopup
    .findUnique({ where: { reference: ref } })
    .catch(() => null);

  // An agent may only ever re-check their own payment.
  if (opts.agentId && row && row.agentId !== opts.agentId) {
    return { ok: false, error: "That payment isn't yours." };
  }
  if (row?.status === "paid") {
    return {
      ok: true,
      credited: 0,
      message: "That top-up is already on the balance.",
    };
  }

  if (!isPaymentConfigured("data")) {
    return { ok: false, error: "Payments aren't configured on this environment." };
  }

  let result;
  try {
    result = await verifyTransaction(ref, "data");
  } catch {
    return { ok: false, error: "Couldn't reach Paystack to check that payment. Try again shortly." };
  }

  if (!result.paid) {
    return {
      ok: false,
      error:
        result.status === "abandoned"
          ? "That payment was never completed, so there is nothing to credit."
          : `Paystack reports that payment as “${result.status}”. Nothing has been credited.`,
    };
  }
  if (result.currency !== "GHS") {
    return { ok: false, error: "That payment wasn't in cedis." };
  }

  const agentId = opts.agentId ?? (await agentForTopup(ref, result.metadata));
  if (!agentId) {
    return {
      ok: false,
      error: "That payment is real but we can't tell which agent it belongs to. Credit it by hand.",
    };
  }

  const amount = round2(result.amountPesewas / 100);
  const credited = await creditWalletTopup(agentId, ref, amount);
  if (!credited) return { ok: false, error: "Couldn't credit that payment. Please try again." };

  return { ok: true, credited: amount, message: `${formatMoney(amount)} credited to the wallet.` };
}

/** Verify a top-up with Paystack and credit it. Used by the agent's redirect. */
export async function verifyAndSettleWalletTopup(reference: string): Promise<boolean> {
  const result = await verifyTransaction(reference, "data");
  if (!result.paid || result.currency !== "GHS") return false;
  return settleWalletTopup(reference, result.amountPesewas, result.metadata);
}

/** Top-ups this agent started and that have not landed yet. */
export async function pendingTopupsFor(agentId: string): Promise<PendingTopup[]> {
  try {
    const rows = await dataDb.dataWalletTopup.findMany({
      where: { agentId, status: "pending" },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { reference: true, amount: true, createdAt: true },
    });
    return rows;
  } catch {
    return [];
  }
}

/**
 * Re-check every top-up still pending, and give up on the ones nobody ever
 * paid. Runs from the data-bundle cron, so a payment that slipped past both
 * the redirect and the webhook is credited within the hour rather than when
 * somebody complains.
 */
export async function sweepWalletTopups(limit = 25): Promise<number> {
  if (!isPaymentConfigured("data")) return 0;

  let rows;
  try {
    rows = await dataDb.dataWalletTopup.findMany({
      where: { status: "pending", createdAt: { lt: new Date(Date.now() - SWEEP_AFTER_MS) } },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: { reference: true, agentId: true, createdAt: true },
    });
  } catch {
    return 0; // table not migrated yet
  }

  let credited = 0;
  for (const row of rows) {
    const result = await reconcileWalletTopup(row.reference, { agentId: row.agentId });
    if (result.ok && result.credited > 0) {
      credited++;
      continue;
    }
    // Paystack knows it and it was never paid — stop re-asking forever.
    if (row.createdAt.getTime() < Date.now() - ABANDON_AFTER_MS) {
      await dataDb.dataWalletTopup
        .updateMany({ where: { reference: row.reference, status: "pending" }, data: { status: "abandoned" } })
        .catch(() => {});
    }
  }
  return credited;
}
