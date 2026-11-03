import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Search } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ServiceApplyForm } from "@/components/data/ServiceApplyForm";
import { agentIsSelling, getAgentBySlug } from "@/lib/data-bundles/agents";
import { getAgentService, termsLines } from "@/lib/data-bundles/services";
import { getServicesConfig } from "@/lib/data-bundles/settings";
import { loadServiceDraft } from "@/lib/data-bundles/service-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; service: string }>;
}): Promise<Metadata> {
  const { slug, service } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) return { title: "Store not found — Nickimart" };
  const row = await getAgentService(agent.id, service);
  if (!row) return { title: `${agent.storeName} — Nickimart` };
  return { title: `${row.name} — ${agent.storeName}`, description: row.tagline || row.summary };
}

/**
 * An agent's copy of a service page.
 *
 * The same form as Nickimart's own, priced from this agent's ladder and
 * credited to them. That is what makes their link a referral link: there is
 * no code to quote and nothing to track — an application that arrives here is
 * theirs because of where it arrived.
 */
export default async function StoreServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; service: string }>;
  searchParams?: Promise<{ code?: string }>;
}) {
  const [{ slug, service: serviceSlug }, query, config] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ code?: string }>({}),
    getServicesConfig(),
  ]);

  if (!config.enabled) notFound();

  const agent = await getAgentBySlug(slug);
  if (!agent || !agentIsSelling(agent) || !agent.servicesEnabled) notFound();

  const service = await getAgentService(agent.id, serviceSlug);
  if (!service) notFound();

  const resumed = query.code ? await loadServiceDraft(query.code) : null;
  const draft = resumed?.ok && resumed.draft.serviceSlug === service.slug ? resumed.draft : null;

  const whatsapp = agent.supportWhatsapp
    ? `https://wa.me/${agent.supportWhatsapp.replace(/\D/g, "").replace(/^0/, "233")}`
    : "";

  return (
    <Container className="py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-niki-ink">{service.name}</h1>
            {service.tagline ? (
              <p className="mt-1 text-sm text-niki-ink/60">{service.tagline}</p>
            ) : null}
          </div>
          <Link
            href={`/store/${agent.slug}/orders`}
            className="flex shrink-0 items-center gap-2 rounded-full bg-niki-surface px-4 py-2.5 text-sm font-semibold text-niki-ink/70 hover:bg-niki-black/5"
          >
            <Search className="h-4 w-4" />
            Track order
          </Link>
        </div>

        {service.summary ? (
          <p className="mb-5 rounded-2xl bg-white p-5 text-sm leading-relaxed text-niki-ink/70 ring-1 ring-niki-edge">
            {service.summary}
          </p>
        ) : null}

        <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
          <ServiceApplyForm
            service={{
              slug: service.slug,
              name: service.name,
              summary: service.summary,
              fields: service.fields,
              terms: termsLines(service.terms),
              variants: service.variants.map((v) => ({
                id: v.id,
                name: v.name,
                description: v.description,
                price: v.sellPrice,
                turnaround: v.turnaround,
                speeds: v.speeds,
                fields: v.fields,
              })),
            }}
            storeSlug={agent.slug}
            draft={draft}
          />
        </div>

        {whatsapp ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="text-sm text-niki-ink/60">
              Questions before you start? Message {agent.storeName}.
            </p>
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="flex shrink-0 items-center gap-1.5 rounded-full bg-niki-ghana px-5 py-2.5 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          </div>
        ) : null}
      </div>
    </Container>
  );
}
