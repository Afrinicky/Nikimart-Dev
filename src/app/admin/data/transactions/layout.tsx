import { Receipt } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";

export const dynamic = "force-dynamic";

/**
 * The money module.
 *
 * Three questions, and they are not the same one. The ledger answers "what
 * happened to the money" — every movement, in and out, across the whole
 * business. Top-ups answer "what have I put in": the floats this business runs
 * on, both the agents' and the provider's, which the ledger does not show
 * because one of them is not Nickimart's own book at all. Audit answers the
 * one an auditor asks, which neither of the others can: do the two of them
 * agree with each other, and where exactly do they part company.
 */
export default function TransactionsModuleLayout({ children }: { children: React.ReactNode }) {
  return (
    <Container className="py-8">
      <ModuleHeader
        title="Transactions"
        subtitle="Every cedi in and out of the bundle business, from the rows it actually happened on."
        icon={Receipt}
      />
      <div className="mt-5">
        <ModuleTabs
          tabs={[
            { href: "/admin/data/transactions", label: "Ledger", icon: "receipt", exact: true },
            { href: "/admin/data/transactions/topups", label: "Top-ups", icon: "banknote" },
            { href: "/admin/data/transactions/audit", label: "Audit", icon: "audit" },
          ]}
        />
      </div>
      <div className="mt-6">{children}</div>
    </Container>
  );
}
