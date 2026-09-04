import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { CurrencyForm } from "@/components/admin/CurrencyForm";
import { getCurrencies, getForwarders } from "@/lib/shipping-config";
import { lastRateRefresh } from "@/lib/fx";
import { HOME_CURRENCY } from "@/lib/shipping";

export const metadata: Metadata = { title: "Currencies — Shipping — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The exchange rates behind every foreign freight quote.
 *
 * On its own screen because it is the one number an admin comes back to often
 * and everything else here is set up once. It is also the one that fails
 * silently: a route quoted in dollars with no rate against it converts
 * one-for-one, turning $260 into GH₵260, and nothing on a buyer's screen says
 * so. The usage column is how that gets noticed.
 */
export default async function ShippingCurrenciesPage() {
  const [currencies, forwarders, refreshedAt] = await Promise.all([
    getCurrencies(),
    getForwarders(),
    lastRateRefresh(),
  ]);

  const usage: Record<string, number> = {};
  for (const f of forwarders) {
    for (const route of f.routes) {
      const code = (route.currency || f.currency || HOME_CURRENCY).toUpperCase();
      usage[code] = (usage[code] ?? 0) + 1;
    }
  }

  return (
    <Container className="py-8">
      <h1 className="font-display text-xl font-bold text-niki-ink">Currencies</h1>
      <p className="mt-1 max-w-2xl text-sm text-niki-ink/60">
        Forwarders quote in their own currency and buyers pay in cedis. These rates are what turns
        one into the other, everywhere, at once — fetched every morning so nobody has to remember
        the day the cedi moved.
      </p>

      <div className="mt-6">
        <CurrencyForm
          currencies={currencies}
          usage={usage}
          lastRefresh={
            refreshedAt
              ? refreshedAt.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" })
              : ""
          }
        />
      </div>
    </Container>
  );
}
