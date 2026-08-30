import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { getSettings } from "@/lib/settings";
import { parseHowItWorksSteps } from "@/lib/how-it-works";

export const metadata: Metadata = {
  title: "How Nickimart Works",
};

/**
 * The steps and the intro line come from Settings — they describe this
 * business's own fulfilment process, which changes without the code changing.
 * Both fall back to the built-in copy, so the page is never blank.
 */
export default async function HowItWorksPage() {
  const settings = await getSettings();
  const steps = parseHowItWorksSteps(settings.howItWorksSteps);

  return (
    <>
      <PageHeader
        title="How Nickimart Works"
        subtitle={settings.howItWorksIntro}
        crumbs={[{ label: "How it works" }]}
        tone="dark"
      />

      <Container className="py-10">
        <ol className="relative space-y-6 border-l-2 border-dashed border-niki-orange/30 pl-6">
          {steps.map((step, i) => (
            <li key={step.title} className="relative">
              <span className="absolute -left-[35px] flex h-7 w-7 items-center justify-center rounded-full bg-niki-orange font-display text-xs font-bold text-white ring-4 ring-niki-surface">
                {i + 1}
              </span>
              <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
                <h3 className="font-semibold text-niki-ink">{step.title}</h3>
                {step.body ? <p className="mt-1.5 text-sm text-niki-ink/65">{step.body}</p> : null}
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-3xl bg-niki-black p-8 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-niki-gold">
            <CheckCircle2 className="h-4 w-4" />
            Covered by Nickimart Buyer Protection at every step
          </p>
          <h2 className="mt-3 font-display text-2xl font-bold text-white">Ready to shop the world?</h2>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/shipped-from-abroad"
              className="flex items-center gap-2 rounded-full bg-niki-orange px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              Start global shopping
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/buy-for-me"
              className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white ring-1 ring-white/30 transition-colors hover:bg-white/10"
            >
              Paste a product link
            </Link>
          </div>
        </div>
      </Container>
    </>
  );
}
