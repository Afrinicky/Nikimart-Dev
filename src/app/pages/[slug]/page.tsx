import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PageRenderer } from "@/components/page/PageRenderer";
import { getRenderSections } from "@/lib/pages";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  let title = slug.charAt(0).toUpperCase() + slug.slice(1);
  try {
    const page = await prisma.page.findUnique({ where: { slug }, select: { title: true } });
    if (page) title = page.title;
  } catch {
    // tables not migrated yet — use the slug-derived title
  }
  return { title: `${title} — NikiMart` };
}

export default async function BuilderPage({ params }: { params: Params }) {
  const { slug } = await params;
  const sections = await getRenderSections(slug);
  if (!sections) notFound();
  return <PageRenderer sections={sections} />;
}
