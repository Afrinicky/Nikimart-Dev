import { auth } from "@/lib/auth";
import { AffiliateShell } from "@/components/affiliate/AffiliateShell";
import { getAffiliateWorkspace } from "@/lib/affiliate-console";
import { getWorkspaces } from "@/lib/workspaces";
import { isRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * The affiliate console's frame.
 *
 * The console is gated by membership rather than by role — an affiliate is any
 * signed-in user with an Affiliate row, so the same person can be a customer,
 * a seller, a bundle agent and an affiliate at once.
 *
 * What is deliberate here is that `/affiliate` stays reachable to everybody.
 * The footer and the Start Selling page have pointed people at it since the
 * programme launched, and a sign-in wall is a poor answer to "what is this".
 * So somebody without an account gets the page bare — the pitch, or the
 * application form — and only an affiliate gets the shell around it. Every
 * other screen in here calls `requireAffiliateConsole`, which sends them back
 * to this one.
 *
 * The frame itself is a client component, because it remembers how this
 * browser likes the sidebar. The guard and the reads stay here, on the server.
 */
export default async function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user?.id
    ? { id: session.user.id, role: isRole(session.user.role) ? session.user.role : "CUSTOMER" }
    : null;

  if (!user) return <>{children}</>;

  const [workspace, workspaces] = await Promise.all([
    getAffiliateWorkspace(user),
    getWorkspaces(user),
  ]);

  if (!workspace.affiliate) return <>{children}</>;

  return (
    <AffiliateShell
      account={{
        name: workspace.affiliate.name,
        code: workspace.affiliate.code,
        status: workspace.affiliate.status,
      }}
      workspaces={workspaces}
    >
      {workspace.affiliate.status === "suspended" ? (
        <p className="animate-fade-up mb-5 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/30">
          Your affiliate account is on hold, so new orders through your links won&apos;t earn
          commission.{" "}
          {workspace.affiliate.suspendReason
            ? workspace.affiliate.suspendReason
            : "Please contact support."}{" "}
          Commission you have already earned is unaffected.
        </p>
      ) : null}

      {workspace.affiliate.status === "pending" ? (
        <p className="animate-fade-up mb-5 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-niki-gold/30">
          Your application is with us. You can browse the catalogue and set yourself up now —
          your links start earning the moment you&apos;re approved.
        </p>
      ) : null}

      {children}
    </AffiliateShell>
  );
}
