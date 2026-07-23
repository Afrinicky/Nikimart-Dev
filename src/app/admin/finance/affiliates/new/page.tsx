import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { AffiliateForm } from "@/components/admin/AffiliateForm";
import { requireDashboard } from "@/lib/session";

export const metadata: Metadata = { title: "Add affiliate — Finance — NikiMart" };

export default async function NewAffiliatePage() {
  await requireDashboard("/admin");
  return (
    <>
      <PageHeader title="Add affiliate" crumbs={[{ label: "Finance", href: "/admin/finance" }, { label: "Affiliates", href: "/admin/finance/affiliates" }, { label: "New" }]}>
        <Link href="/admin/finance/affiliates" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </PageHeader>
      <Container className="max-w-2xl py-8">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
          <AffiliateForm />
        </div>
      </Container>
    </>
  );
}
