import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActionLink } from "@/components/ui/motion";
import { OrderTracker } from "@/components/data/OrderTracker";
import { lookupOrders } from "@/lib/data-bundles/lookup";

export const metadata: Metadata = { title: "Track a Data Order — NikiMart" };
export const dynamic = "force-dynamic";

export default async function DataOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; paid?: string; afa?: string; failed?: string }>;
}) {
  const params = await searchParams;
  const outcome = await lookupOrders(params.q);

  return (
    <>
      <PageHeader
        title="Track a data order"
        subtitle="Enter your reference or the phone number you paid with to see where your bundle is."
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "Track order" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-2xl">
          <OrderTracker
            outcome={outcome}
            query={params.q ?? ""}
            basePath="/data-bundles/orders"
            notices={{
              paid: Boolean(params.paid),
              afa: Boolean(params.afa),
              failed: Boolean(params.failed),
            }}
          />

          <p className="mt-6 text-center text-sm text-niki-ink/60">
            Need another bundle?{" "}
            <ActionLink
              href="/data-bundles"
              className="font-semibold text-niki-orange hover:underline"
            >
              Back to the data store
            </ActionLink>
          </p>
        </div>
      </Container>
    </>
  );
}
