import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MessageCircle, Search } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ServiceApplyForm } from "@/components/data/ServiceApplyForm";
import { getHouseService, termsLines } from "@/lib/data-bundles/services";
import { getDataStoreConfig, getServicesConfig } from "@/lib/data-bundles/settings";
import { loadServiceDraft } from "@/lib/data-bundles/service-actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const service = await getHouseService(slug);
  if (!service) return { title: "Service not found — Nickimart" };
  return {
    title: `${service.name} — Nickimart`,
    description: service.tagline || service.summary,
  };
}

/**
 * Applying for a service on Nickimart's own store.
 *
 * Built like the AFA page it sits beside: a header saying what this is, one
 * card holding the whole thing, and a line underneath about what happens next.
 * The agent storefront has its own copy of this page, priced from that agent's
 * ladder; everything else about the two is identical, which is deliberate.
 */
export default async function ServiceApplyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ code?: string }>;
}) {
  const [{ slug }, query, config, store] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ code?: string }>({}),
    getServicesConfig(),
    getDataStoreConfig(),
  ]);

  if (!config.enabled) notFound();
  const service = await getHouseService(slug);
  if (!service) notFound();

  // Picking up where they left off, if they brought a code with them.
  const resumed = query.code ? await loadServiceDraft(query.code) : null;
  const draft = resumed?.ok && resumed.draft.serviceSlug === service.slug ? resumed.draft : null;

  return (
    <>
      <PageHeader
        title={service.name}
        subtitle={service.tagline}
        crumbs={[
          { label: "Data bundles", href: "/data-bundles" },
          { label: service.name },
        ]}
        tone="dark"
      >
        <Link
          href="/data-bundles/orders"
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
        >
          <Search className="h-4 w-4" />
          Track order
        </Link>
      </PageHeader>

      <Container className="py-8">
        <div className="mx-auto max-w-2xl">
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
              draft={draft}
            />
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <p className="text-sm text-niki-ink/60">
              Questions before you start? Talk to us first — it is quicker than getting it wrong.
            </p>
            {store.whatsapp ? (
              <a
                href={store.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-niki-ghana px-5 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : null}
          </div>

          <p className="mt-6 text-center text-xs text-niki-ink/40">
            Already started? Open{" "}
            <Link href="/data-bundles/services/resume" className="font-semibold text-niki-orange hover:underline">
              your saved application
            </Link>{" "}
            with the code you were given.
          </p>
        </div>
      </Container>
    </>
  );
}
