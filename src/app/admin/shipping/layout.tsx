import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Container } from "@/components/ui/Container";
import { ShippingNav } from "@/components/admin/ShippingNav";
import { requireDashboard } from "@/lib/session";

/**
 * The shipping console.
 *
 * One tab, four screens, and everything that decides a shipping fee is on one
 * of them. It used to be spread across Shipping, Arrival points and Settings,
 * which meant nobody could see the whole configuration at once and a rate set
 * in one place could quietly contradict a rate set in another.
 */
export default async function AdminShippingLayout({ children }: { children: ReactNode }) {
  await requireDashboard("/admin");

  return (
    <>
      <PageHeader
        title="Shipping"
        subtitle="Where goods gather, what it costs to move them, and who brings them in from abroad."
        crumbs={[{ label: "Admin", href: "/admin" }, { label: "Shipping" }]}
      />
      <Container className="pt-6">
        <ShippingNav />
      </Container>
      {children}
    </>
  );
}
