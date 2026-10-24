import "server-only";
import type { Prisma } from ".prisma/medical-client";
import type { MedicalStaffSession } from "@/lib/medical/session";

/**
 * The security record: who changed what, when.
 *
 * Distinct from `QuotationEvent` and `TenderEvent`, which are the commercial
 * history of one document and are read by the people working it. This is kept
 * whether or not anybody ever looks at it, and it is the thing that answers
 * "who changed this price" six months later.
 *
 * Written inside the caller's transaction, always. An audit row committed
 * separately from the change it describes is an audit row that can exist for a
 * change that was rolled back, or — worse — be missing for one that was not.
 */

export interface AuditEntry {
  action:
    | "CREATE"
    | "UPDATE"
    | "DELETE"
    | "ISSUE"
    | "SEND"
    | "ACCEPT"
    | "REJECT"
    | "APPROVE"
    | "CANCEL"
    | "RECEIVE"
    | "ADJUST"
    | "PAY"
    | "EXPORT"
    // The selling side's own three events, added when the screens that record
    // them were built. DISPATCH and DELIVER are not RECEIVE in reverse and
    // COLLECT is not PAY: one is money arriving and the other is money leaving,
    // and an audit trail that calls them the same thing cannot be read.
    | "DISPATCH"
    | "DELIVER"
    | "COLLECT";
  entity: string;
  entityId: string;
  summary: string;
  /** `{ before, after }` for the fields that moved. Kept small on purpose. */
  changes?: Record<string, unknown>;
}

export async function recordAudit(
  tx: Prisma.TransactionClient,
  staff: Pick<MedicalStaffSession, "staffId" | "name"> | null,
  entry: AuditEntry,
): Promise<void> {
  await tx.medicalAuditLog.create({
    data: {
      staffId: staff?.staffId ?? null,
      // Kept as plain text as well as a relation, so the record survives the
      // staff row being removed. An audit trail that loses the actor when
      // somebody leaves is an audit trail of nothing.
      actorId: staff?.staffId ?? "",
      actorName: staff?.name ?? "System",
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      summary: entry.summary,
      changes: JSON.stringify(entry.changes ?? {}),
    },
  });
}

/**
 * The fields that actually changed, as `{ field: { before, after } }`.
 *
 * Logging a whole row on every edit makes the log unreadable and buries the
 * one field that moved. Only differences are kept, and a save that changed
 * nothing produces no entry at all.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { before: unknown; after: unknown }> {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const [key, next] of Object.entries(after)) {
    const previous = before[key];
    if (sameValue(previous, next)) continue;
    changes[key] = { before: normalise(previous), after: normalise(next) };
  }
  return changes;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  // Decimal columns arrive as objects that stringify exactly; comparing them
  // with === would report every save as a change to every money field.
  if (a && b && typeof a === "object" && typeof b === "object") {
    return String(a) === String(b);
  }
  if (a == null && b == null) return true;
  return false;
}

function normalise(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === "object") return String(value);
  return value;
}
