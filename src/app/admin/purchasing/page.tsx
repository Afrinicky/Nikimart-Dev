import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { PurchaseQueueTable } from "@/components/admin/PurchaseQueueTable";
import { PurchaseOrdersTable } from "@/components/admin/PurchaseOrdersTable";
import { getPurchaseOrders, getPurchaseQueue } from "@/lib/purchasing";
import { requireDashboard } from "@/lib/session";

export const metadata: Metadata = { title: "Order placement — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * When to place the international orders, and the record of having placed them.
 *
 * A customer pays for one pair of shoes and no forwarder will ship one pair of
 * shoes. So the line waits for other lines going to the same supplier — a
 * supplier who sells shoes also sells bags — until the parcel clears the
 * forwarder's minimum for the lane it is travelling on. This screen is that
 * wait made visible, with the supplier's own link on every row so the admin
 * placing the order goes straight to the item.
 */
export default async function AdminPurchasingPage() {
  await requireDashboard("/admin");
  const [queue, purchases] = await Promise.all([getPurchaseQueue(), getPurchaseOrders()]);

  const ready = queue.filter((g) => g.thresholdMet || g.scheduleDue);
  const waitingCbm = queue.reduce((s, g) => s + g.totalCbm, 0);

  return (
    <>
      <PageHeader
        title="Order placement"
        subtitle="What has been paid for, what is still waiting on volume, and what has been bought."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Order placement" }]}
      />
      <Container className="space-y-8 py-8">
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Ready to order" value={String(ready.length)} tone="success" />
          <Stat label="Suppliers waiting" value={String(queue.length)} />
          <Stat label="Volume waiting" value={`${waitingCbm.toFixed(3)} m³`} />
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="font-display text-lg font-bold text-niki-ink">Waiting to be ordered</h2>
            <p className="mt-1 max-w-3xl text-sm text-niki-ink/60">
              One row is one supplier on one lane — the parcel that will be shipped. It turns green
              when its volume clears the forwarder&apos;s minimum, or when the lane&apos;s ordering
              date comes round.
            </p>
          </div>
          <PurchaseQueueTable groups={queue} />
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-lg font-bold text-niki-ink">Orders placed</h2>
          <PurchaseOrdersTable purchases={purchases} />
        </section>
      </Container>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
      <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/50">{label}</p>
      <p
        className={`mt-1 font-figures text-2xl font-bold ${
          tone === "success" ? "text-niki-success" : "text-niki-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
