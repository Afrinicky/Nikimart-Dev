import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Package, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ServiceForm } from "@/components/admin/ServiceForm";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getServiceById } from "@/lib/data-bundles/services";
import { deleteService } from "@/lib/data-bundles/service-admin-actions";

export const metadata: Metadata = { title: "Edit product — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDataAdmin();
  const { id } = await params;
  const service = await getServiceById(id);
  if (!service) notFound();

  return (
    <Container className="py-8">
      <Link
        href="/admin/data/products"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Products
      </Link>

      <ModuleHeader title={service.name} subtitle={service.tagline} icon={Package}>
        <Link
          href={`/data-bundles/services/${service.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-full bg-niki-surface px-4 py-2.5 text-sm font-semibold text-niki-ink/70 hover:bg-niki-black/5"
        >
          <ExternalLink className="h-4 w-4" />
          View
        </Link>
        <form action={deleteService}>
          <input type="hidden" name="id" value={service.id} />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-full bg-niki-danger/10 px-4 py-2.5 text-sm font-semibold text-niki-danger hover:bg-niki-danger/15"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </form>
      </ModuleHeader>

      <div className="mt-6">
        <ServiceForm
          initial={{
            id: service.id,
            slug: service.slug,
            name: service.name,
            tagline: service.tagline,
            summary: service.summary,
            imageUrl: service.imageUrl,
            icon: service.icon,
            accentFrom: service.accentFrom,
            accentTo: service.accentTo,
            fields: service.fields,
            terms: service.terms,
            isActive: service.isActive,
            onStore: service.onStore,
            order: service.order,
            variants: service.variants.map((v) => ({
              id: v.id,
              name: v.name,
              description: v.description,
              price: v.price,
              agentPrice: v.agentPrice,
              turnaround: v.turnaround,
              speeds: v.speeds,
              fields: v.fields,
              isActive: v.isActive,
              order: v.order,
            })),
          }}
        />
      </div>
    </Container>
  );
}
