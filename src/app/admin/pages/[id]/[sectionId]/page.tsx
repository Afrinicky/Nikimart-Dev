import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { SectionForm } from "@/components/admin/SectionForm";
import { prisma } from "@/lib/prisma";
import { blockDef, type SectionConfig } from "@/lib/page-blocks";
import { updateSection } from "@/lib/page-actions";

export const metadata: Metadata = { title: "Edit section — Admin — NikiMart" };

type Params = Promise<{ id: string; sectionId: string }>;

export default async function EditSectionPage({ params }: { params: Params }) {
  const { id, sectionId } = await params;
  const section = await prisma.pageSection.findUnique({ where: { id: sectionId } });
  if (!section || section.pageId !== id) notFound();

  let config: SectionConfig = {};
  try {
    config = JSON.parse(section.config) as SectionConfig;
  } catch {
    config = {};
  }

  const action = updateSection.bind(null, sectionId);
  const label = blockDef(section.type)?.label ?? section.type;

  return (
    <Container className="max-w-2xl py-8">
      <Link href={`/admin/pages/${id}`} className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to page
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {label}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <SectionForm action={action} type={section.type} config={config} pageId={id} />
      </div>
    </Container>
  );
}
