import "server-only";
import { dataDb } from "@/lib/data-db";

/**
 * Whether Paystack is actually reaching us.
 *
 * An order settles on the buyer's redirect or on Paystack's webhook, and when
 * a checkout is interrupted the redirect never runs — so the webhook is the
 * only thing standing between a captured charge and an order that reads
 * "awaiting payment" until somebody notices. A webhook that was never
 * configured, or that is being sent to an old domain, fails exactly that way:
 * silently, one order at a time, with nothing anywhere saying so.
 *
 * So the moment a correctly signed event arrives, the time is written down.
 * The setup checklist then answers the question directly instead of leaving it
 * to be inferred from a growing pile of unpaid orders.
 *
 * Deliberately one row, not a log: the only question worth answering here is
 * "has it ever worked, and how recently".
 */

const KEY = "paystackWebhookLastSeenAt";

/** Stamp a signed event. Best-effort — never fails the settlement behind it. */
export async function recordWebhookSeen(at: Date = new Date()): Promise<void> {
  try {
    const value = at.toISOString();
    await dataDb.dataSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value },
      update: { value },
    });
  } catch {
    // Table not migrated, or the database is briefly away. The event itself
    // has already been handled; only the note about it is skipped.
  }
}

/** When Paystack last reached this deployment, or null if it never has. */
export async function lastWebhookSeen(): Promise<Date | null> {
  try {
    const row = await dataDb.dataSetting.findUnique({ where: { key: KEY } });
    if (!row?.value) return null;
    const at = new Date(row.value);
    return Number.isNaN(at.getTime()) ? null : at;
  } catch {
    return null;
  }
}

/** How the checklist reads it: green only when one has genuinely arrived. */
export function webhookStatus(at: Date | null): { ok: boolean; detail: string } {
  if (!at) {
    return {
      ok: false,
      detail:
        "No signed event has ever reached this deployment. Until one does, an order whose " +
        "buyer does not come back from Paystack is only settled by the re-checks. Add " +
        "the webhook in Paystack → Settings → API Keys & Webhooks, pointing at " +
        "/api/paystack/webhook on this domain.",
    };
  }
  const hours = Math.round((Date.now() - at.getTime()) / 3_600_000);
  const when =
    hours < 1 ? "in the last hour" : hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
  return { ok: true, detail: `Last signed event received ${when}.` };
}
