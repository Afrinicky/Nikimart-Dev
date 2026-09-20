import type { Metadata } from "next";
import { HandCoins, Megaphone } from "lucide-react";
import { Card } from "@/components/agent/AgentUi";
import { TeamShell } from "@/components/agent/TeamShell";
import { ReferralShare } from "@/components/agent/ReferralShare";
import { TeamPosts } from "@/components/agent/TeamPosts";
import { siteUrl } from "@/lib/site";
import { getReferralConfig } from "@/lib/data-bundles/settings";
import { referralLink, referralRewardsLine } from "@/lib/data-bundles/referral-rules";
import { getTeamPosts } from "@/lib/data-bundles/team/communication";
import { teamPageContext } from "@/lib/data-bundles/team/page-data";

export const metadata: Metadata = { title: "Build my team — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Getting more people in, and talking to the ones already here. */
export default async function TeamBuildPage() {
  const { agent } = await teamPageContext();
  const [config, posts] = await Promise.all([getReferralConfig(), getTeamPosts(agent.id, 10)]);
  const link = referralLink(siteUrl(), agent.code);

  return (
    <TeamShell active="/agent/team/build">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ReferralShare code={agent.code} link={link} />
        <Card title="How it pays" icon={HandCoins}>
          <ul className="space-y-3 text-sm text-niki-ink/70">
            {[
              referralRewardsLine(config),
              "Joining rewards pay once your recruit's registration fee is settled.",
              "You also earn on every qualifying bundle your direct recruits sell.",
              "Everything lands in your normal balance.",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-niki-orange" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
          {config.pitch ? (
            <p className="mt-4 rounded-xl bg-niki-surface px-4 py-3 text-sm text-niki-ink/70">
              {config.pitch}
            </p>
          ) : null}
        </Card>
      </div>

      <TeamPosts posts={posts} />

      <p className="flex items-start gap-2.5 rounded-2xl bg-white px-5 py-4 text-xs leading-relaxed text-niki-ink/55 ring-1 ring-niki-edge">
        <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-niki-ink/35" />
        <span>
          Your team sees announcements on their own dashboard. Keep one pinned for the thing you
          are tired of repeating.
        </span>
      </p>
    </TeamShell>
  );
}
