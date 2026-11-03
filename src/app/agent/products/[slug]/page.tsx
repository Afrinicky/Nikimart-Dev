import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Share2 } from "lucide-react";
import { AgentPageHeading, Card } from "@/components/agent/AgentUi";
import { ServiceShareStudio } from "@/components/agent/ServiceShareStudio";
import { requireDataUser } from "@/lib/data-bundles/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAgentService } from "@/lib/data-bundles/services";
import { getServicesConfig } from "@/lib/data-bundles/settings";
import {
  defaultServiceMessage,
  getAgentServiceBranding,
  serviceFlyerData,
  serviceLink,
} from "@/lib/data-bundles/service-flyer";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Share — Products — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Sharing one service.
 *
 * The flyer is drawn from this agent's own prices, so what goes out quotes
 * what they charge — and the link under it is their storefront's copy of the
 * page, which is what makes an application off it theirs.
 */
export default async function AgentServiceSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireDataUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const config = await getServicesConfig();
  if (!config.enabled) notFound();

  const { slug } = await params;
  const service = await getAgentService(agent.id, slug);
  if (!service) notFound();

  const branding = await getAgentServiceBranding(agent);
  const link = serviceLink(service.slug, agent.slug);
  const turnaround = service.variants[0]?.turnaround ?? "";

  const data = serviceFlyerData({
    service,
    storeName: agent.storeName,
    link,
    sharedBy: agent.storeName,
    message: "",
  });

  return (
    <div className="space-y-5">
      <Link
        href="/agent/products"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Products
      </Link>

      <AgentPageHeading title={service.name} subtitle={service.tagline} />

      <Card
        title="Share this"
        description="A flyer built from your prices, and the link that credits the sale to you."
        icon={Share2}
      >
        <ServiceShareStudio
          data={data}
          imageUrl={service.imageUrl || null}
          design={branding.design}
          link={`${siteUrl()}/store/${agent.slug}/services/${service.slug}`}
          initialMessage={defaultServiceMessage(service.name, turnaround)}
        />
      </Card>
    </div>
  );
}
