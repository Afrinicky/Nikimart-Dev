import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { OrderTracker } from "@/components/data/OrderTracker";
import { lookupOrders } from "@/lib/data-bundles/lookup";
import { getAgentBySlug } from "@/lib/data-bundles/agents";

export const metadata: Metadata = { title: "Track an order — NikiMart" };
export const dynamic = "force-dynamic";

/**
 * The tracker on an agent's storefront. Same lookup as NikiMart's own — a
 * reference or the phone number that paid — so a customer who lost the tab can
 * still find their bundle without an account.
 */
export default async function StoreOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; paid?: string; afa?: string; failed?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const outcome = await lookupOrders(query.q);

  return (
    <Container className="py-8">
      <div className="mx-auto max-w-2xl">
        <OrderTracker
          outcome={outcome}
          query={query.q ?? ""}
          basePath={`/store/${agent.slug}/orders`}
          notices={{
            paid: Boolean(query.paid),
            afa: Boolean(query.afa),
            failed: Boolean(query.failed),
          }}
        />

        <p className="mt-6 text-center text-sm text-niki-ink/60">
          Need another bundle?{" "}
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
