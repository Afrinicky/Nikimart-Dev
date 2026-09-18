import { redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { AgentShell } from "@/components/agent/AgentShell";
import { NewPasswordForm } from "@/components/agent/NewPasswordForm";
import { RegistrationFeePanel } from "@/components/agent/RegistrationFeePanel";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAgentForUser, getAnnouncements } from "@/lib/data-bundles/agents";
import { getDataStoreConfig, getLeaderboardConfig } from "@/lib/data-bundles/settings";
import { registrationFeeStatus } from "@/lib/data-bundles/registration-fee";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The agent platform shell.
 *
 * Membership, not role, is what gates this: an agent is any signed-in user with
 * a DataAgent row, so someone can be a customer and an agent at once.
 * `/become-an-agent` sits outside it — that is where people go *before* they
 * have an account to show.
 *
 * The frame itself is a client component, because it remembers how this browser
 * likes the sidebar and which notices this person has already read. The guard
 * and the reads stay here, on the server.
 */
export default async function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [agent, store, leaderboard, notices, account] = await Promise.all([
    getAgentForUser(user.id),
    getDataStoreConfig(),
    getLeaderboardConfig(),
    getAnnouncements(10),
    // Only ever true for somebody registered by another agent: they were sent
    // a working password rather than asked to choose one.
    prisma.user
      .findUnique({ where: { id: user.id }, select: { mustChangePassword: true } })
      .catch(() => null),
  ]);

  if (!agent) redirect("/become-an-agent");

  // A password that arrived by text is a way in, not a password. Nothing in
  // the console opens until they have replaced it — handled here, in the
  // layout, so it holds on every screen rather than the one they happened to
  // land on, and outside the shell, because a sidebar full of places they
  // cannot go yet is only an invitation to try.
  if (account?.mustChangePassword) {
    return (
      <Container className="py-10">
        <div className="mx-auto max-w-lg">
          <h1 className="font-display text-xl font-bold text-niki-ink">Choose your password</h1>
          <p className="mb-5 mt-1 text-sm text-niki-ink/60">
            One step, and your store is yours.
          </p>
          <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
            <NewPasswordForm email={user.email ?? ""} />
          </div>
        </div>
      </Container>
    );
  }

  const suspended = agent.status !== "active";
  const fee = registrationFeeStatus(agent);

  return (
    <AgentShell
      store={{
        name: agent.storeName,
        slug: agent.slug,
        code: agent.code,
        afaEnabled: store.afaEnabled,
        leaderboardEnabled: leaderboard.enabled,
      }}
      announcements={notices.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        tone: n.tone,
        createdAt: n.createdAt.toISOString(),
      }))}
    >
      {suspended ? (
        <p className="animate-fade-up mb-5 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger ring-1 ring-niki-danger/30">
          Your account is suspended and your store is closed. Please contact support.
        </p>
      ) : null}

      {/*
        An agent who chose to pay their registration fee up front sees it on
        every screen until they have: it is the one thing outstanding against
        their account, and somebody else — whoever recruited them — is waiting
        on it.
      */}
      {fee.payable ? (
        <div className="animate-fade-up mb-5">
          <RegistrationFeePanel amount={formatMoney(fee.outstanding)} />
        </div>
      ) : null}

      {children}
    </AgentShell>
  );
}
