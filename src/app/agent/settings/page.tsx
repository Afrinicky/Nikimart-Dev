import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck, KeyRound, UserRound } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { AgentPageHeading, Card } from "@/components/agent/AgentUi";
import { CopyChip } from "@/components/agent/AgentCode";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatWhen } from "@/components/agent/AgentUi";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Settings — Agent — NikiMart" };
export const dynamic = "force-dynamic";

function ReadOnly({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon?: React.ElementType;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-niki-ink">{label}</span>
      <div className="flex items-center gap-2 rounded-xl border border-niki-edge-strong bg-niki-surface px-4 py-2.5 text-sm text-niki-ink/75">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-niki-ink/35" /> : null}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

export default async function AgentSettingsPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const profile = await prisma.user
    .findUnique({ where: { id: user.id }, select: { name: true, email: true, phone: true } })
    .catch(() => null);

  return (
    <div className="space-y-5">
      <AgentPageHeading title="Settings" subtitle="Your account details and security." />

      <Card
        title="Account details"
        description="Your NikiMart profile, as your agent account sees it."
        icon={UserRound}
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/40">
              Personal information
            </p>
            <ReadOnly label="Full name" value={profile?.name || "—"} icon={UserRound} />
            <ReadOnly label="Email" value={profile?.email || user.email || "—"} />
            <ReadOnly label="Phone number" value={profile?.phone || agent.supportPhone || "—"} />
          </div>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/40">
              Account information
            </p>
            <ReadOnly label="Account type" value="Data agent" icon={BadgeCheck} />
            <div>
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">Agent code</span>
              <CopyChip
                value={agent.code}
                className="w-full justify-start border border-niki-edge-strong bg-niki-surface py-2.5 text-niki-ink/75"
              />
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-niki-ink">Account status</span>
              <div className="flex items-center gap-2 rounded-xl border border-niki-edge-strong bg-niki-surface px-4 py-2.5 text-sm">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    agent.status === "active" ? "bg-niki-success" : "bg-niki-danger",
                  )}
                />
                <span className="font-semibold uppercase text-niki-ink/75">{agent.status}</span>
              </div>
            </div>
            <ReadOnly label="Agent since" value={formatWhen(agent.createdAt)} />
          </div>
        </div>

        <p className="mt-5 text-xs text-niki-ink/50">
          Name, email and phone are your NikiMart account details —{" "}
          <ActionLink href="/account" className="font-semibold text-niki-orange hover:underline">
            update them in your account
          </ActionLink>
          . Store details live under{" "}
          <ActionLink
            href="/agent/store?tab=link"
            className="font-semibold text-niki-orange hover:underline"
          >
            Store → Store Link
          </ActionLink>
          .
        </p>
      </Card>

      <Card title="Security" description="Change the password you sign in with." icon={KeyRound}>
        <p className="text-sm text-niki-ink/65">
          Your agent account uses the same sign-in as the rest of NikiMart, so passwords are changed
          in one place.
        </p>
        <ActionLink
          href="/forgot-password"
          className="niki-press mt-4 inline-flex items-center gap-2 rounded-xl bg-niki-navy px-5 py-3 text-sm font-bold text-white"
        >
          <KeyRound className="h-4 w-4" />
          Change password
        </ActionLink>
      </Card>
    </div>
  );
}
