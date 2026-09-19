import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { AgentPageHeading, Card, formatWhen } from "@/components/agent/AgentUi";
import { AgentPasswordForm, AgentProfileForm } from "@/components/agent/AgentProfileForm";
import { CopyChip } from "@/components/agent/AgentCode";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Settings — Agent — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const profile = await prisma.user
    .findUnique({
      where: { id: user.id },
      select: {
        name: true,
        email: true,
        phone: true,
        twoFactorEnabled: true,
        twoFactorChannel: true,
      },
    })
    .catch(() => null);

  return (
    <div className="space-y-5">
      <AgentPageHeading title="Settings" />

      <AgentProfileForm
        initial={{
          name: profile?.name ?? "",
          email: profile?.email ?? user.email ?? "",
          phone: profile?.phone ?? agent.supportPhone ?? "",
        }}
      />

      <AgentPasswordForm />

      <TwoFactorSettings
        enabled={profile?.twoFactorEnabled ?? false}
        channel={profile?.twoFactorChannel ?? "email"}
        hasPhone={Boolean(profile?.phone ?? agent.supportPhone)}
      />

      <Card title="Account" icon={BadgeCheck}>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium text-niki-ink/50">Agent code</dt>
            <dd className="mt-1.5">
              <CopyChip
                value={agent.code}
                className="w-full justify-start border border-niki-edge-strong bg-niki-surface py-2 text-niki-ink/75"
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-niki-ink/50">Status</dt>
            <dd className="mt-1.5 flex items-center gap-2 rounded-xl border border-niki-edge-strong bg-niki-surface px-4 py-2 text-sm">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  agent.status === "active" ? "bg-niki-success" : "bg-niki-danger",
                )}
              />
              <span className="font-semibold uppercase text-niki-ink/75">{agent.status}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-niki-ink/50">Agent since</dt>
            <dd className="mt-1.5 rounded-xl border border-niki-edge-strong bg-niki-surface px-4 py-2 text-sm text-niki-ink/75">
              {formatWhen(agent.createdAt)}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
