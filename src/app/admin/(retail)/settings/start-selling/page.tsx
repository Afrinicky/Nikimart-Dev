import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { StartSellingForm } from "@/components/admin/StartSellingForm";
import { ActionLink } from "@/components/ui/motion";
import { getSettings } from "@/lib/settings";
import { getVendorRegistrationFee } from "@/lib/seller-registration";
import { getAffiliatePolicy } from "@/lib/affiliate-settings";
import { getAgentProgramConfig } from "@/lib/data-bundles/settings";
import { getStartSellingFees, feeForChannel } from "@/lib/start-selling";
import { requireDashboard } from "@/lib/session";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Start Selling — Settings — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the Start Selling page charges.
 *
 * Each programme can name a second price for people who arrive through that
 * page, and each one is set where that programme is run — so this screen owns
 * the shop's and shows the other two, with the console that sets them one
 * click away. What it is for is the whole picture: three prices, and what each
 * of them is instead of.
 */
export default async function AdminStartSellingPage() {
  await requireDashboard("/admin");

  const [settings, shop, policy, program, fees] = await Promise.all([
    getSettings(),
    getVendorRegistrationFee(),
    getAffiliatePolicy(),
    getAgentProgramConfig(),
    getStartSellingFees(),
  ]);

  const normal = { shop, agent: program.setupFee, affiliate: policy.registrationFee };
  const quoted = {
    shop: feeForChannel("shop", "start-selling", normal.shop, fees),
    agent: feeForChannel("agent", "start-selling", normal.agent, fees),
    affiliate: feeForChannel("affiliate", "start-selling", normal.affiliate, fees),
  };

  return (
    <Container className="max-w-3xl py-6 sm:py-8">
      <div>
        <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">
          Start Selling prices
        </h2>
        <p className="mt-1 text-sm text-niki-ink/60">
          What somebody pays to join through{" "}
          <ActionLink
            href="/start-selling"
            className="inline-flex items-center gap-0.5 font-semibold text-niki-orange hover:underline"
          >
            the Start Selling page <ArrowUpRight className="h-3.5 w-3.5" />
          </ActionLink>
          . Everywhere else, each programme charges its own price. A tile that is not the shop&apos;s
          is set in that programme&apos;s console — open it to change it.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {(
          [
            ["Open a shop", quoted.shop, normal.shop, "/admin/settings"],
            ["Data bundles", quoted.agent, normal.agent, "/admin/data/agents/settings"],
            ["Refer and earn", quoted.affiliate, normal.affiliate, "/admin/affiliates/settings"],
          ] as const
        ).map(([label, price, usual, href]) => (
          <ActionLink
            key={label}
            href={href}
            className="niki-focus group rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50 sm:p-4"
          >
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-niki-ink/50 sm:text-xs">
              {label}
            </p>
            <p className="mt-1.5 font-figures text-lg font-bold text-niki-ink sm:text-2xl">
              {price > 0 ? formatMoney(price) : "Free"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-niki-ink/45">
              {price === usual
                ? "Same as usual"
                : `Usually ${usual > 0 ? formatMoney(usual) : "free"}`}
            </p>
          </ActionLink>
        ))}
      </div>

      <div className="mt-6 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
        <h3 className="font-display font-bold text-niki-ink">Opening a shop</h3>
        <p className="mb-4 mt-0.5 text-sm text-niki-ink/60">
          The other two are set under{" "}
          <ActionLink
            href="/admin/data/agents/settings"
            className="font-semibold text-niki-orange hover:underline"
          >
            Data bundles → Programme settings
          </ActionLink>{" "}
          and{" "}
          <ActionLink
            href="/admin/affiliates/settings"
            className="font-semibold text-niki-orange hover:underline"
          >
            Affiliates → Programme settings
          </ActionLink>
          .
        </p>
        <StartSellingForm
          settings={settings as unknown as Record<string, string>}
          normal={normal.shop}
        />
      </div>
    </Container>
  );
}
