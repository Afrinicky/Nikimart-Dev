import { Share2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";

export const dynamic = "force-dynamic";

/**
 * The referral programme.
 *
 * Its own module because it is its own economy: agents recruiting agents, two
 * levels deep, with rates that decide what every future payout is worth. What
 * it pays and what it has paid were one long page; they are two questions, and
 * the one you came to answer should not require scrolling past the other.
 */
export default function ReferralsModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-8">
      <ModuleHeader
        title="Referrals"
        subtitle="Agents recruit agents with their own code. Two levels, and no further."
        icon={Share2}
      />
      <div className="mt-5">
        <ModuleTabs
          tabs={[
            { href: "/admin/data/referrals", label: "Network", icon: "users", exact: true },
            {
              href: "/admin/data/referrals/settings",
              label: "Rates & rules",
              icon: "rules",
            },
          ]}
        />
      </div>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
