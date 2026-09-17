import { Trophy } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { listRedemptions } from "@/lib/data-bundles/points";

export const dynamic = "force-dynamic";

/**
 * Leaderboard and rewards.
 *
 * Four things that were one very long page: the boards agents are looking at,
 * the rules that draw them, the shelf of rewards, and the queue of claims
 * waiting to be handed over. Only the last needs doing today, so it carries a
 * count — the others are read when you want them.
 */
export default async function LeaderboardModuleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const waiting = await listRedemptions("pending").catch(() => []);

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Leaderboard"
        subtitle="Sell, rank, earn points, redeem — counted from the sales and referrals you already have."
        icon={Trophy}
      />
      <div className="mt-5">
        <ModuleTabs
          tabs={[
            { href: "/admin/data/leaderboard", label: "Standings", icon: "trophy", exact: true },
            { href: "/admin/data/leaderboard/rewards", label: "Rewards", icon: "gift" },
            {
              href: "/admin/data/leaderboard/claims",
              label: "Claims",
              icon: "receipt",
              badge: waiting.length,
            },
            {
              href: "/admin/data/leaderboard/settings",
              label: "Rules",
              icon: "rules",
            },
          ]}
        />
      </div>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
