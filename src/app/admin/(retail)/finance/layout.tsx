import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Container } from "@/components/ui/Container";
import { FinanceNav } from "@/components/admin/retail/FinanceNav";
import { requireDashboard } from "@/lib/session";

/**
 * The money console.
 *
 * Finance and Transactions were separate entries over the same cedis, each
 * with its own idea of what had gone out to sellers. One module, four tabs:
 * the position, the settlements, the movements behind them, and what the
 * trading actually earned.
 */
export default async function AdminFinanceLayout({ children }: { children: ReactNode }) {
  await requireDashboard("/admin");

  return (
    <>
      <PageHeader
        title="Finance"
        subtitle="What the mall earned, what is owed, and every cedi in and out."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Finance" }]}
      />
      <Container className="pt-5 sm:pt-6">
        <FinanceNav />
      </Container>
      {children}
    </>
  );
}
