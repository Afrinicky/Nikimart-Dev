import { redirect } from "next/navigation";
import { AffiliateShell } from "@/components/affiliate/AffiliateShell";
import { getAffiliateWorkspace } from "@/lib/affiliate-console";
import { getAssistSummary } from "@/lib/affiliate-assist";
import { getWorkspaces } from "@/lib/workspaces";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The affiliate console's frame.
 *
 * Membership, not role, is what gates this: an affiliate is any signed-in user
 * with an Affiliate row, so the same person can be a customer, a seller, a
 * bundle agent and an affiliate at once. Anybody without one goes to
 * `/become-an-affiliate`, which is the pitch and the application — the console
 * is not the place to explain what a console is for.
 *
 * The frame itself is a client component, because it remembers how this
 * browser likes the sidebar. The guard and the reads stay here, on the server.
 * The storefront's own header and footer are suppressed across `/affiliate`
 * (see components/layout/ChromeGate): a sidebar owns the full height of the
 * window, and a second bottom bar under this one's is one too many.
 */
export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [workspace, workspaces] = await Promise.all([
    getAffiliateWorkspace({ id: user.id, role: user.role }),
    getWorkspaces({ id: user.id, role: user.role }),
  ]);

  const affiliate = workspace.affiliate;
  if (!affiliate) redirect("/become-an-affiliate");

  // The counts the sidebar nags with. Cached per request, so the pages that
  // ask for the same figures do not read them twice.
  const summary = await getAssistSummary(affiliate.id);

  return (
    <AffiliateShell
      account={{
        name: affiliate.name,
        code: affiliate.code,
        status: affiliate.status,
      }}
      workspaces={workspaces}
      counts={{
        unread: summary.unread,
        followUps: summary.followUps,
        escalations: summary.escalations,
      }}
    >
      {affiliate.status === "suspended" ? (
        <p className="animate-fade-up mb-5 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/30">
          Your affiliate account is on hold, so new orders through your links won&apos;t earn
          commission.{" "}
          {affiliate.suspendReason
            ? affiliate.suspendReason
            : "Please contact support."}{" "}
          Commission you have already earned is unaffected.
        </p>
      ) : null}

      {affiliate.status === "pending" ? (
        <p className="animate-fade-up mb-5 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-niki-gold/30">
          Your application is with us. You can browse the catalogue and set yourself up now —
          your links start earning the moment you&apos;re approved.
        </p>
      ) : null}

      {children}
    </AffiliateShell>
  );
}
