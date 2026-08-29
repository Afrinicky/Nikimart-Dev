import type { Metadata } from "next";
import { LifeBuoy, Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { formatWhen } from "@/components/agent/AgentUi";
import { prisma } from "@/lib/prisma";
import { resolveSupportRequest } from "@/lib/data-bundles/agent-admin-actions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Agent Support — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/** Callback requests raised from the agent Support screen. */
export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const status = params.status === "resolved" ? "resolved" : "open";

  const rows = await prisma.dataSupportRequest
    .findMany({ where: { status }, orderBy: { createdAt: "desc" }, take: 100 })
    .catch(() => []);

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Agent support</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Callback requests from agents, newest first.
          </p>
        </div>
        <div className="flex gap-2">
          {["open", "resolved"].map((s) => (
            <ActionLink
              key={s}
              href={`/admin/data/support?status=${s}`}
              className={cn(
                "rounded-full px-4 py-2 text-xs font-semibold capitalize",
                s === status
                  ? "bg-niki-orange text-white"
                  : "bg-white text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-navy/5",
              )}
            >
              {s}
            </ActionLink>
          ))}
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-white px-4 py-12 text-center ring-1 ring-niki-edge">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/35">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">
              No {status} requests
            </p>
          </div>
        ) : (
          rows.map((r) => (
            <article key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-display font-bold text-niki-ink">{r.fullName}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-niki-ink/60">
                    <Phone className="h-3.5 w-3.5" />
                    <a href={`tel:${r.phone}`} className="font-mono hover:text-niki-orange">
                      {r.phone}
                    </a>
                    <span className="text-niki-ink/35">· prefers {r.language}</span>
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <time className="text-xs text-niki-ink/45">{formatWhen(r.createdAt)}</time>
                  {r.status === "open" ? (
                    <form action={resolveSupportRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button
                        type="submit"
                        className="niki-press rounded-full bg-niki-success px-3 py-1.5 text-[11px] font-bold text-white"
                      >
                        Mark done
                      </button>
                    </form>
                  ) : (
                    <span className="rounded-full bg-niki-success/10 px-2.5 py-1 text-[11px] font-semibold uppercase text-niki-success ring-1 ring-niki-success/30">
                      Resolved
                    </span>
                  )}
                </div>
              </div>
              <p className="mt-3 rounded-xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/70">
                {r.message}
              </p>
            </article>
          ))
        )}
      </div>
    </Container>
  );
}
