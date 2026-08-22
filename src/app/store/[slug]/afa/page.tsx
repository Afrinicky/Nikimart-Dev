import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BadgeCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { AfaForm } from "@/components/data/AfaForm";
import { getDataStoreConfig } from "@/lib/settings";
import { getAgentBySlug } from "@/lib/data-bundles/agents";

export const metadata: Metadata = { title: "AFA Registration — NikiMart" };
export const dynamic = "force-dynamic";

/** AFA registration on an agent's storefront, at that agent's price. */
export default async function StoreAfaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const store = await getDataStoreConfig();
  if (!store.enabled || !store.afaEnabled || !agent.afaEnabled) notFound();
  if (agent.status !== "active" || !agent.storeOpen) notFound();

  const price = agent.afaPrice > 0 ? agent.afaPrice : store.afaPrice;

  return (
    <Container className="py-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-3xl bg-white p-6 ring-1 ring-black/5 sm:p-8">
          <div className="mb-5 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-niki-orange/10 text-niki-orange">
              <BadgeCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-lg font-bold text-niki-ink">AFA registration</h1>
              <p className="text-xs text-niki-ink/55">
                Register a number for AFA — done online, no paperwork.
              </p>
            </div>
          </div>

          <AfaForm price={price} storeSlug={agent.slug} trackHref={`/store/${agent.slug}/orders`} />
        </div>

        <p className="mt-6 text-center text-sm text-niki-ink/60">
          <ActionLink
            href={`/store/${agent.slug}`}
            className="font-semibold text-niki-orange hover:underline"
          >
            Back to {agent.storeName}
          </ActionLink>
        </p>
      </div>
    </Container>
  );
}
