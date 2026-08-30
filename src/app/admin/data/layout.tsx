import Link from "next/link";
import { ExternalLink, Signal } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DataSubNav } from "@/components/admin/DataSubNav";

/**
 * The data-bundle console lives inside the existing admin shell (nav, auth and
 * role guard all come from /admin/layout.tsx) and adds only its own second-level
 * tabs — so bundle work never leaves the admin, and never mixes with the mall's
 * product screens.
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
                <p className="font-display font-bold text-niki-ink">Data bundles</p>
                <p className="text-xs text-niki-ink/50">Prices, orders and AFA registrations</p>
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
