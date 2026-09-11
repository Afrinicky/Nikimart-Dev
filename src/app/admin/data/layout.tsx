import Link from "next/link";
import { ExternalLink, Signal } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DataSubNav } from "@/components/admin/DataSubNav";

/**
 * The Data Bundles console.
 *
 * One of the admin's two consoles — the other is Retail Services — reached from
 * the switcher in /admin/layout.tsx, which is also where auth and the role guard
 * come from. Everything below is the bundle business and nothing else: its own
 * tabs, its own database, its own Paystack account. The mall's product and
 * shipping screens are not reachable from here, and that is the point.
 */
export default function AdminDataLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="border-b border-niki-edge bg-white/60">
        <Container className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-niki-orange/10 text-niki-orange">
                <Signal className="h-4 w-4" />
              </span>
              <div>
                <p className="font-display font-bold text-niki-ink">Data Bundles</p>
                <p className="text-xs text-niki-ink/50">
                  Prices, orders, AFA, agents and referrals
                </p>
              </div>
            </div>
            <Link
              href="/data-bundles"
              className="flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-xs font-semibold text-white"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View storefront
            </Link>
          </div>
          <div className="mt-3">
            <DataSubNav />
          </div>
        </Container>
      </div>
      {children}
    </>
  );
}
