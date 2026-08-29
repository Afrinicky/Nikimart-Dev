import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { AffiliateForm } from "@/components/admin/AffiliateForm";
import { requireDashboard } from "@/lib/session";

export const metadata: Metadata = { title: "Add affiliate — Admin — Nickimart" };

export default async function NewAffiliatePage() {
  await requireDashboard("/admin");
  return (
    <>
      <PageHeader title="Add affiliate" crumbs={[{ label: "Affiliates", href: "/admin/affiliates" }, { label: "New" }]}>
        <Link href="/admin/affiliates" className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </PageHeader>
      <Container className="max-w-2xl py-8">
        <div className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
          <AffiliateForm />
        </div>
      </Container>
    </>
  );
}
