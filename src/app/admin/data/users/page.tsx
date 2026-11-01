import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { KeyRound, Lock, ShieldCheck, Signal, UserCog } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { TableFilters } from "@/components/admin/TableFilters";
import { FilterChip } from "@/components/admin/FilterChip";
import { dataDb } from "@/lib/data-db";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { DATA_ROLES, isDataRole } from "@/lib/data-bundles/roles";
import { lockStatus } from "@/lib/data-bundles/lockout-rules";

export const metadata: Metadata = { title: "Users — Data bundles — Nickimart" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;

/**
 * Who can sign in to the bundle business.
 *
 * The twin of the mall's Users page, against `DataUser`. The console had no
 * such screen at all: an agent's account could only be reached by finding
 * their storefront first, and an administrator's could not be reached from
 * here at all — the only link out went to the mall's user editor, which since
 * the split writes a different database.
 *
 * Everything an account can be in is visible from the list rather than one
 * click in, because the questions this page gets asked are "who is locked
 * out" and "who has a second step", and both should be answerable by looking.
 */
export default async function DataUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; state?: string; page?: string }>;
}) {
  await requireDataAdmin();
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const role = params.role && isDataRole(params.role) ? params.role : null;
  const state = params.state === "locked" || params.state === "2fa" ? params.state : null;
  const page = Math.max(1, Number(params.page) || 1);

  const where = {
    ...(role ? { role } : {}),
    ...(state === "locked" ? { OR: [{ lockoutStage: { gte: 3 } }, { lockedUntil: { gt: new Date() } }] } : {}),
    ...(state === "2fa" ? { twoFactorEnabled: true } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" as const } },
            { name: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query.replace(/\D/g, "") || query } },
          ],
        }
      : {}),
  };

  const [rows, total, agents, counts, lockedCount, twoFactorCount] = await Promise.all([
    dataDb.dataUser.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        twoFactorEnabled: true,
        lockoutStage: true,
        lockedUntil: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    }),
    dataDb.dataUser.count({ where }),
    dataDb.dataAgent.findMany({ select: { id: true, userId: true, code: true, storeName: true } }),
    dataDb.dataUser.groupBy({ by: ["role"], _count: { _all: true } }),
    dataDb.dataUser.count({
      where: { OR: [{ lockoutStage: { gte: 3 } }, { lockedUntil: { gt: new Date() } }] },
    }),
    dataDb.dataUser.count({ where: { twoFactorEnabled: true } }),
  ]);

  const agentByUser = new Map(agents.map((a) => [a.userId, a]));
  const countByRole = new Map(counts.map((c) => [c.role, c._count._all]));
  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const now = new Date();

  const th = "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45";
  const td = "px-5 py-3.5 align-middle text-sm";

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Users</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Everyone who can sign in to the data bundles console.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <FilterChip href="/admin/data/users" label={`All (${total})`} active={!role && !state} />
        {DATA_ROLES.map((r) => (
          <FilterChip
            key={r}
            href={`/admin/data/users?role=${r}`}
            label={`${r === "ADMIN" ? "Administrators" : "Agents"} (${countByRole.get(r) ?? 0})`}
            active={role === r}
          />
        ))}
        <FilterChip
          href="/admin/data/users?state=locked"
          label={`Locked out (${lockedCount})`}
          active={state === "locked"}
        />
        <FilterChip
          href="/admin/data/users?state=2fa"
          label={`Two-step on (${twoFactorCount})`}
          active={state === "2fa"}
        />
      </div>

      <div className="mt-4">
        <Suspense fallback={<div className="h-28" />}>
          <TableFilters
            query={query}
            searchPlaceholder="Search by name, email or phone…"
            searchLabel="Search users"
            filters={[]}
            shown={rows.length}
            total={total}
            page={page}
            pageCount={pageCount}
            noun="users"
          />
        </Suspense>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem]">
            <thead className="bg-niki-surface">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Signs in with</th>
                <th className={th}>Role</th>
                <th className={th}>Storefront</th>
                <th className={th}>Account</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-niki-edge">
              {rows.map((u) => {
                const agent = agentByUser.get(u.id);
                const lock = lockStatus(
                  {
                    failedLoginCount: 0,
                    lockoutStage: u.lockoutStage,
                    lockedUntil: u.lockedUntil,
                  },
                  now,
                );
                return (
                  <tr key={u.id} className="hover:bg-niki-surface/60">
                    <td className={td}>
                      <span className="font-semibold text-niki-ink">{u.name ?? "—"}</span>
                    </td>
                    <td className={td}>
                      <span className="block text-niki-ink/80">{u.email}</span>
                      {u.phone ? (
                        <span className="block text-xs text-niki-ink/50">{u.phone}</span>
                      ) : null}
                    </td>
                    <td className={td}>
                      <span
                        className={
                          u.role === "ADMIN"
                            ? "inline-flex items-center gap-1 rounded-full bg-niki-orange/10 px-2.5 py-1 text-xs font-bold text-niki-orange"
                            : "inline-flex items-center gap-1 rounded-full bg-niki-black/5 px-2.5 py-1 text-xs font-semibold text-niki-ink/70"
                        }
                      >
                        {u.role === "ADMIN" ? (
                          <UserCog className="h-3 w-3" />
                        ) : (
                          <Signal className="h-3 w-3" />
                        )}
                        {u.role === "ADMIN" ? "Administrator" : "Agent"}
                      </span>
                    </td>
                    <td className={td}>
                      {agent ? (
                        <Link
                          href={`/admin/data/agents/${agent.id}`}
                          className="font-medium text-niki-orange hover:underline"
                        >
                          {agent.storeName}
                        </Link>
                      ) : (
                        <span className="text-niki-ink/35">—</span>
                      )}
                    </td>
                    <td className={td}>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!u.passwordHash ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                            <KeyRound className="h-3 w-3" /> No password
                          </span>
                        ) : null}
                        {u.mustChangePassword ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                            Must change
                          </span>
                        ) : null}
                        {lock.locked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-niki-danger/10 px-2 py-0.5 text-[11px] font-bold text-niki-danger ring-1 ring-niki-danger/25">
                            <Lock className="h-3 w-3" />
                            {lock.needsAdmin ? "Locked out" : "Locked"}
                          </span>
                        ) : null}
                        {u.twoFactorEnabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-niki-success/10 px-2 py-0.5 text-[11px] font-semibold text-niki-success">
                            <ShieldCheck className="h-3 w-3" /> Two-step
                          </span>
                        ) : null}
                        {u.passwordHash && !lock.locked && !u.twoFactorEnabled && !u.mustChangePassword ? (
                          <span className="text-xs text-niki-ink/35">Nothing to do</span>
                        ) : null}
                      </div>
                    </td>
                    <td className={`${td} text-right`}>
                      {agent ? (
                        <Link
                          href={`/admin/data/agents/${agent.id}`}
                          className="niki-focus text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
                        >
                          Manage →
                        </Link>
                      ) : (
                        // An administrator has no storefront, so there is no
                        // agent page to send them to. Said plainly rather than
                        // left as a dead link that looks like a bug.
                        <span className="text-xs text-niki-ink/35">No storefront</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-niki-ink/50">
                    {query || role || state
                      ? "Nobody matches that."
                      : "No accounts yet. They arrive when agents are approved."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </Container>
  );
}
