import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  BadgeDollarSign,
  ImageDown,
  Package,
  Receipt,
  TrendingUp,
  UserPlus,
  Wallet,
} from "lucide-react";
import { AgentPageHeading, Card, EmptyRow, TableScroll, formatWhen } from "@/components/agent/AgentUi";
import { ServiceTabs } from "@/components/agent/ServiceTabs";
import { ServiceShelf } from "@/components/agent/ServiceShelf";
import { ServicePricingTable } from "@/components/agent/ServicePricingTable";
import { ServiceAssistForm } from "@/components/data/ServiceAssistForm";
import { FlyerDesigner } from "@/components/affiliate/FlyerDesigner";
import { requireDataUser } from "@/lib/data-bundles/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAgentServiceRows, getAgentShelf } from "@/lib/data-bundles/services";
import { getAgentServiceTotals, getServiceOrders } from "@/lib/data-bundles/service-orders";
import {
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_TONES,
  isServiceStatus,
} from "@/lib/data-bundles/service-status";
import { getServicesConfig } from "@/lib/data-bundles/settings";
import { isServiceTab } from "@/lib/data-bundles/service-tabs";
import {
  defaultServiceMessage,
  getAgentServiceBranding,
  serviceFlyerData,
  serviceLink,
} from "@/lib/data-bundles/service-flyer";
import { saveAgentServiceFlyerDesign } from "@/lib/data-bundles/service-agent-actions";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Products — Agent — Nickimart" };
export const dynamic = "force-dynamic";

function Tile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <div className="flex items-start gap-2 text-niki-ink/50">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase leading-tight tracking-wide sm:text-xs">
          {label}
        </span>
      </div>
      <p className="mt-2 font-figures text-xl font-bold text-niki-ink sm:text-2xl">{value}</p>
    </div>
  );
}

/**
 * Products: the services an agent can sell alongside their bundles.
 *
 * Four tabs, each a different job. The catalogue is what to put on the store
 * and what to share; pricing is what to charge; orders is what has come of it;
 * the flyer is how the share looks. The same arrangement the Store screen
 * uses, so there is nothing new to learn.
 */
export default async function AgentProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireDataUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const config = await getServicesConfig();
  const params = await searchParams;
  const tab = isServiceTab(params.tab) ? params.tab : "catalogue";

  if (!config.enabled) {
    return (
      <div className="space-y-5">
        <AgentPageHeading title="Products" />
        <Card>
          <EmptyRow>
            Services are closed at the moment. They will appear here when Nickimart reopens them.
          </EmptyRow>
        </Card>
      </div>
    );
  }

  const totals = await getAgentServiceTotals(agent.id);

  return (
    <div className="space-y-5">
      <AgentPageHeading
        title="Products"
        subtitle="Registrations and services you can sell alongside your bundles."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Service sales" value={formatMoney(totals.sales)} icon={TrendingUp} />
        <Tile label="Commission earned" value={formatMoney(totals.earned)} icon={Wallet} />
        <Tile label="Awaiting completion" value={formatMoney(totals.pending)} icon={Receipt} />
      </div>

      {/* Suspense because the tabs read the query string. */}
      <Suspense fallback={<div className="h-12" />}>
        <ServiceTabs />
      </Suspense>

      {tab === "catalogue" ? <CataloguePanel agentId={agent.id} /> : null}
      {tab === "pricing" ? <PricingPanel agentId={agent.id} /> : null}
      {tab === "orders" ? <OrdersPanel agentId={agent.id} /> : null}
      {tab === "flyer" ? <FlyerPanel agent={agent} /> : null}
    </div>
  );
}

async function CataloguePanel({ agentId }: { agentId: string }) {
  const rows = await getAgentServiceRows(agentId);

  return (
    <Card
      title="Catalogue"
      description="Choose what appears on your storefront, and share any of it."
      icon={Package}
    >
      <ServiceShelf
        items={rows.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          tagline: s.tagline,
          icon: s.icon,
          imageUrl: s.imageUrl,
          accentFrom: s.accentFrom,
          accentTo: s.accentTo,
          visible: s.visible,
          fromPrice: s.fromPrice,
          bestCommission: s.variants.reduce((best, v) => Math.max(best, v.commission), 0),
          options: s.variants.length,
        }))}
      />
    </Card>
  );
}

async function PricingPanel({ agentId }: { agentId: string }) {
  const rows = await getAgentServiceRows(agentId);

  return (
    <Card
      title="Pricing"
      description="What you charge for each option, and what you make on it."
      icon={BadgeDollarSign}
    >
      <ServicePricingTable
        rows={rows.flatMap((s) =>
          s.variants.map((v) => ({
            variantId: v.id,
            serviceName: s.name,
            variantName: v.name,
            agentPrice: v.costPrice,
            retailPrice: v.price,
            price: v.sellPrice,
            commission: v.commission,
            isCustom: v.sellPrice !== v.price,
          })),
        )}
      />
    </Card>
  );
}

async function OrdersPanel({ agentId }: { agentId: string }) {
  const [{ rows }, shelf] = await Promise.all([
    getServiceOrders({ agentId, take: 25 }),
    getAgentShelf(agentId),
  ]);

  return (
    <div className="space-y-5">
      <Card
        title="Register a customer"
        description="For someone who would rather you did it for them. Ends in a link they pay themselves."
        icon={UserPlus}
      >
        <ServiceAssistForm
          services={shelf.map((s) => ({
            slug: s.slug,
            name: s.name,
            variants: s.variants.map((v) => ({
              id: v.id,
              name: v.name,
              price: v.sellPrice,
              turnaround: v.turnaround,
              speeds: v.speeds,
            })),
          }))}
        />
      </Card>

      <Card title="Your service orders" description="Everything applied for through your store.">
        {rows.length === 0 ? (
          <EmptyRow>No service orders yet. Share a flyer to get started.</EmptyRow>
        ) : (
          <TableScroll>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-niki-edge text-[11px] uppercase tracking-wide text-niki-ink/45">
                  <th className="py-2.5 pr-4 font-semibold">Customer</th>
                  <th className="py-2.5 pr-4 font-semibold">Service</th>
                  <th className="py-2.5 pr-4 font-semibold">Price</th>
                  <th className="py-2.5 pr-4 font-semibold">Commission</th>
                  <th className="py-2.5 pr-4 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-niki-edge">
                {rows.map((o) => {
                  const status = isServiceStatus(o.status) ? o.status : "pending";
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-niki-surface/70">
                      <td className="py-3 pr-4">
                        <span className="font-medium text-niki-ink">{o.customerName}</span>
                        <span className="block font-mono text-[11px] text-niki-ink/45">
                          {o.customerPhone}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-niki-ink/70">
                        {o.serviceName}
                        <span className="block text-[11px] text-niki-ink/45">{o.variantName}</span>
                      </td>
                      <td className="py-3 pr-4 font-semibold text-niki-ink">
                        {formatMoney(o.price)}
                      </td>
                      <td
                        className={cn(
                          "py-3 pr-4 font-semibold",
                          o.commissionStatus === "earned" ? "text-niki-success" : "text-niki-ink/40",
                        )}
                      >
                        {o.agentCommission > 0 ? formatMoney(o.agentCommission) : "—"}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={cn(
                            "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
                            SERVICE_STATUS_TONES[status],
                          )}
                        >
                          {SERVICE_STATUS_LABELS[status]}
                        </span>
                      </td>
                      <td className="py-3 whitespace-nowrap text-xs text-niki-ink/55">
                        {formatWhen(o.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>
    </div>
  );
}

async function FlyerPanel({
  agent,
}: {
  agent: {
    id: string;
    slug: string;
    storeName: string;
    serviceFlyerDesign: string;
    serviceFlyerTheme: string;
  };
}) {
  const [branding, shelf] = await Promise.all([
    getAgentServiceBranding(agent),
    getAgentShelf(agent.id),
  ]);

  const sample = shelf[0];
  const data = serviceFlyerData({
    service: sample ?? {
      name: "Business registration",
      tagline: "Registrar-General filing, handled end to end",
      icon: "🏢",
      accentFrom: "#1d4ed8",
      accentTo: "#3b82f6",
      fromPrice: 450,
      variants: [],
    },
    storeName: agent.storeName,
    link: serviceLink(sample?.slug ?? "business-registration", agent.slug),
    sharedBy: agent.storeName,
    message: defaultServiceMessage(
      sample?.name ?? "business registration",
      sample?.variants[0]?.turnaround ?? "",
    ),
  });

  return (
    <Card
      title="Flyer design"
      description="How your service shares look. Anything you don't change stays on Nickimart's house design."
      icon={ImageDown}
    >
      <FlyerDesigner
        initial={branding.design}
        fallback={branding.house}
        fallbackLabel="Nickimart's house design"
        sample={data}
        sampleImageUrl={sample?.imageUrl || null}
        action={saveAgentServiceFlyerDesign}
        custom={branding.custom}
        savingLabel="Save my design"
      />
    </Card>
  );
}
