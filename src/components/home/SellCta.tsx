import Link from "next/link";
import { ArrowRight, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";

/**
 * A slim, friendly "start selling" strip under the carousel. Kept to a single
 * compact row so it invites sellers without pushing the product grid down.
 */
export function SellCta() {
  return (
    <section className="bg-niki-surface pt-3">
      <Container>
        <Link
          href="/sell"
          className="group flex items-center justify-between gap-3 rounded-2xl bg-niki-navy px-4 py-3 ring-1 ring-black/5 transition-colors hover:bg-niki-navy/95 sm:px-5"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-niki-orange/20 text-niki-orange">
              <Store className="h-5 w-5" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-white">Got something to sell?</span>
              <span className="hidden text-xs text-white/60 sm:block">
                Open your shop on NikiMart — it&apos;s free to start.
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-niki-orange px-4 py-2 text-xs font-bold text-white transition-transform group-hover:translate-x-0.5 sm:text-sm">
            Start selling
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </Container>
    </section>
  );
}
