import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { PurchaseQueueTable } from "@/components/admin/PurchaseQueueTable";
import { PurchaseOrdersTable } from "@/components/admin/PurchaseOrdersTable";
import { getPurchaseOrders, getPurchaseQueue } from "@/lib/purchasing";
import { getSellerVendor } from "@/lib/seller";
import { requireDashboard } from "@/lib/session";

export const metadata: Metadata = { title: "International orders — Seller — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * A seller's view of the same queue: what of theirs is waiting, and what has
 * been bought.
 *
 * Read-only, deliberately. Placing an order spends the platform's money with a
 * supplier abroad, so it stays with an admin — but a seller who cannot see
 * whether their goods have been bought has no way to answer the one question
 * their customers keep asking.
 */
export default async function SellerPurchasingPage() {
  const user = await requireDashboard("/seller");
  const vendor = await getSellerVendor(user.id);

  if (!vendor) {
    return (
      <>
        <PageHeader title="International orders" crumbs={[{ label: "Seller", href: "/seller" }]} />
        <Container className="py-8">
          <p className="rounded-2xl bg-white p-6 text-sm text-niki-ink/60 ring-1 ring-niki-edge">
            Register your shop first — international orders are tracked per shop.
          </p>
        </Container>
      </>
    );
  }

  const [queue, purchases] = await Promise.all([
    getPurchaseQueue(vendor.id),
    getPurchaseOrders(vendor.id),
  ]);

  return (
    <>
      <PageHeader
        title="International orders"
        subtitle="What your customers have paid for from abroad, and whether NikiMart has bought it yet."
        crumbs={[{ label: "Seller", href: "/seller" }, { label: "International orders" }]}
      />
      <Container className="space-y-8 py-8">
        <section className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Waiting to be ordered</h2>
            <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
              Your forwarder will not ship under their minimum volume, so paid orders gather here
              per supplier until there is enough to send. NikiMart places the order.
            </p>
          </div>
          <PurchaseQueueTable groups={queue} readOnly />
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-niki-ink">Orders placed</h2>
          <PurchaseOrdersTable purchases={purchases} readOnly />
        </section>
      </Container>
    </>
  );
}
