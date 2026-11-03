import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ServiceForm } from "@/components/admin/ServiceForm";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { Package } from "lucide-react";

export const metadata: Metadata = { title: "New product — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  await requireDataAdmin();

  return (
    <Container className="py-8">
      <Link
        href="/admin/data/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Products
      </Link>

      <ModuleHeader
        title="New product"
        subtitle="A registration, a certificate, an application — anything with a fee, a form and a turnaround."
        icon={Package}
      />

      <div className="mt-6">
        <ServiceForm
          initial={{
            id: "",
            slug: "",
            name: "",
            tagline: "",
            summary: "",
            imageUrl: "",
            icon: "📄",
            accentFrom: "#ff6a00",
            accentTo: "#ff9a3d",
            fields: [],
            terms: "",
            isActive: true,
            onStore: true,
            order: 0,
            variants: [],
          }}
        />
      </div>
    </Container>
  );
}
