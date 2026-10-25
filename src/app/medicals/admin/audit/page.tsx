import { Suspense } from "react";
import { ScrollText } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { ConsoleTable, Row, td, tdKey } from "@/components/medical/console/ConsoleTable";
import { ConsolePager } from "@/components/medical/console/ConsolePager";
import { ConsoleSearch, FilterChips } from "@/components/medical/console/ConsoleFilters";
import { StatusBadge, type Tone } from "@/components/medical/console/StatusBadge";
import { readPaging } from "@/lib/medical/admin/paging";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb, readMedical } from "@/lib/medical/db";
import { formatDateTime } from "@/lib/medical/format";

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;

/**
 * Who changed what, and when.
 *
 * Read-only, and no screen anywhere writes to it or deletes from it: an audit
 * log somebody can edit is not an audit log. Entries are written inside the
 * transaction that made the change they describe, so a row here cannot exist
 * for a change that was rolled back, nor be missing for one that was not.
 *
 * The actor is stored as plain text beside the staff id, which is why a
 * departed colleague's changes still say who made them after their record has
 * gone.
 */
export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  await requireMedicalStaff("/medicals/admin/audit");
  const query = await searchParams;
  const { page, perPage, skip } = readPaging(query);
  const q = one(query.q);
  const action = one(query.action);
  const entity = one(query.entity);

  const where = {
    ...(action ? { action } : {}),
    ...(entity ? { entity } : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q, mode: "insensitive" as const } },
            { actorName: { contains: q, mode: "insensitive" as const } },
            { entityId: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const { rows, total, entities } = await readMedical(
    async () => {
      const [rows, total, grouped] = await Promise.all([
        medicalDb.medicalAuditLog.findMany({
          where,
          select: {
            id: true,
            action: true,
            entity: true,
            entityId: true,
            summary: true,
            actorName: true,
            createdAt: true,
            staff: { select: { id: true, name: true, role: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: perPage,
        }),
        medicalDb.medicalAuditLog.count({ where }),
        // Built from what is actually in the log rather than from a hardcoded
        // list, so the filter cannot drift out of date as models are added.
        medicalDb.medicalAuditLog.groupBy({ by: ["entity"], _count: { entity: true } }),
      ]);
      return {
        rows,
        total,
        entities: grouped
          .map((g) => ({ value: g.entity, label: g.entity, count: g._count.entity }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 12),
      };
    },
    { rows: [], total: 0, entities: [] as { value: string; label: string; count: number }[] },
  );

  const pageCount = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="space-y-5">
      <ConsoleHeader
        title="Audit log"
        subtitle="Every change, with the person who made it. Append-only — nothing here can be edited or removed."
        icon={ScrollText}
      />

      <div className="space-y-3">
        <Suspense fallback={<div className="h-9 w-80" />}>
          <ConsoleSearch
            placeholder="Summary, person or record reference"
            className="w-full sm:w-96"
          />
        </Suspense>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Suspense fallback={null}>
            <FilterChips name="action" options={ACTIONS} allLabel="All actions" />
          </Suspense>
          {entities.length > 0 ? (
            <Suspense fallback={null}>
              <FilterChips name="entity" options={entities} allLabel="All records" />
            </Suspense>
          ) : null}
        </div>
      </div>

      <ConsoleTable
        minWidth={900}
        columns={["When", "Who", "Action", "Record", "What changed"]}
        empty={{
          title: "Nothing logged yet",
          body: "Entries appear here as soon as anybody changes anything in the console.",
        }}
        footer={
          <Suspense fallback={null}>
            <ConsolePager page={page} pageCount={pageCount} perPage={perPage} total={total} />
          </Suspense>
        }
      >
        {rows.map((entry) => (
          <Row key={entry.id}>
            <td className={tdKey}>
              <span className="font-figures font-normal">{formatDateTime(entry.createdAt)}</span>
            </td>
            <td className={td}>
              {entry.staff?.name || entry.actorName || (
                <span className="medi-meta text-medi-muted">System</span>
              )}
              {entry.staff?.role ? (
                <span className="medi-meta mt-0.5 block text-medi-muted">
                  {entry.staff.role.toLowerCase()}
                </span>
              ) : null}
            </td>
            <td className={td}>
              <StatusBadge label={label(entry.action)} tone={tone(entry.action)} />
            </td>
            <td className={td}>
              {entry.entity}
              {entry.entityId ? (
                <span className="medi-meta font-figures mt-0.5 block text-medi-muted">
                  {entry.entityId.slice(-8)}
                </span>
              ) : null}
            </td>
            <td className={td}>
              <span className="medi-prose block max-w-prose">{entry.summary || "—"}</span>
            </td>
          </Row>
        ))}
      </ConsoleTable>
    </div>
  );
}

/**
 * Tones say what an entry means rather than what it is called: something
 * created or approved reads as progress, something rejected or deleted as a
 * thing worth looking at twice.
 */
const TONES: Record<string, Tone> = {
  CREATE: "progress",
  UPDATE: "neutral",
  DELETE: "bad",
  ISSUE: "progress",
  SEND: "progress",
  ACCEPT: "good",
  REJECT: "bad",
  APPROVE: "good",
  CANCEL: "bad",
  RECEIVE: "good",
  ADJUST: "warn",
  PAY: "good",
  COLLECT: "good",
  DISPATCH: "progress",
  DELIVER: "good",
  EXPORT: "info",
  LOGIN: "neutral",
};

const LABELS: Record<string, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  ISSUE: "Issued",
  SEND: "Sent",
  ACCEPT: "Accepted",
  REJECT: "Rejected",
  APPROVE: "Approved",
  CANCEL: "Cancelled",
  RECEIVE: "Received",
  ADJUST: "Adjusted",
  PAY: "Paid",
  COLLECT: "Collected",
  DISPATCH: "Dispatched",
  DELIVER: "Delivered",
  EXPORT: "Exported",
  LOGIN: "Signed in",
};

const ACTIONS = Object.keys(LABELS).map((value) => ({ value, label: LABELS[value] }));

const tone = (action: string): Tone => TONES[action] ?? "neutral";
const label = (action: string): string => LABELS[action] ?? action.toLowerCase();
