import type { Metadata } from "next";
import { Gauge } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PerformanceSettingsForm } from "@/components/admin/PerformanceSettingsForm";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = { title: "Performance — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * What the site is allowed to spend compute on.
 *
 * The hosting allowance is metered in CPU-seconds, and the features that spend
 * it are mostly not the features that earn: a link-preview card drawn for a
 * scraper, an orders screen refreshing itself in a tab nobody is reading, a
 * crawler walking filter combinations no shopper ever asked for. Every one of
 * those is worth having when there is room for it and worth stopping when
 * there is not — and that decision changes with the month, not with the code,
 * so it belongs here rather than in a deploy.
 *
 * See docs/compute-audit.md for what each switch actually costs.
 */
export default async function PerformanceSettingsPage() {
  const settings = await getSettings();

  return (
    <Container className="max-w-3xl py-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-niki-black text-niki-orange">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-bold text-niki-ink sm:text-xl">Performance</h2>
          <p className="mt-1 text-sm text-niki-ink/60">
            Switches for the work the site does that no shopper asked for. Nothing on this page can
            take the shop offline — browsing, search, the cart and checkout are untouched by every
            setting here. Turning something off costs a convenience, and each switch says which.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <PerformanceSettingsForm settings={settings} />
      </div>
    </Container>
  );
}
