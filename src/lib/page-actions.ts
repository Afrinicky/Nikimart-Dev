"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import {
  DEFAULT_ABOUT_SECTIONS,
  DEFAULT_HOME_SECTIONS,
  blockDef,
  type SectionConfig,
  type SectionType,
} from "@/lib/page-blocks";
import type { CrudState } from "@/lib/admin-actions";

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

function revalidateSite(slug?: string) {
  revalidatePath("/");
  if (slug) revalidatePath(`/pages/${slug}`);
  revalidatePath("/admin/pages");
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

const pageSchema = z.object({
  title: z.string().trim().min(2, "Title is required."),
  slug: z.string().trim().min(1, "Slug is required."),
});

export async function createPage(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = pageSchema.safeParse({ title: str(fd, "title"), slug: slugify(str(fd, "slug") || str(fd, "title")) });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) if (typeof i.path[0] === "string") fieldErrors[i.path[0]] = i.message;
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const slug = slugify(parsed.data.slug);
  const existing = await prisma.page.findUnique({ where: { slug } });
  if (existing) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  const page = await prisma.page.create({ data: { slug, title: parsed.data.title } });
  revalidateSite(slug);
  redirect(`/admin/pages/${page.id}`);
}

export async function updatePageMeta(id: string, fd: FormData): Promise<void> {
  await requireAdmin();
  const title = str(fd, "title");
  await prisma.page.update({
    where: { id },
    data: { title: title || undefined, isPublished: bool(fd, "isPublished") },
  });
  const page = await prisma.page.findUnique({ where: { id }, select: { slug: true } });
  revalidateSite(page?.slug);
}

export async function deletePage(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const page = await prisma.page.findUnique({ where: { id } });
  if (page && !page.isSystem) {
    await prisma.page.delete({ where: { id } });
    revalidateSite(page.slug);
    redirect("/admin/pages");
  }
}

/** Creates the built-in home + about pages from defaults if they don't exist. */
export async function ensureDefaultPages(): Promise<void> {
  await requireAdmin();
  const specs = [
    { slug: "home", title: "Home", isSystem: true, sections: DEFAULT_HOME_SECTIONS },
    { slug: "about", title: "About", isSystem: false, sections: DEFAULT_ABOUT_SECTIONS },
  ];
  for (const spec of specs) {
    const existing = await prisma.page.findUnique({ where: { slug: spec.slug } });
    if (existing) continue;
    await prisma.page.create({
      data: {
        slug: spec.slug,
        title: spec.title,
        isSystem: spec.isSystem,
        sections: {
          create: spec.sections.map((s, i) => ({
            type: s.type,
            order: i,
            isVisible: s.isVisible ?? true,
            config: JSON.stringify(s.config),
          })),
        },
      },
    });
  }
  revalidateSite();
  redirect("/admin/pages");
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function addSection(fd: FormData): Promise<void> {
  await requireAdmin();
  const pageId = str(fd, "pageId");
  const type = str(fd, "type") as SectionType;
  if (!pageId || !blockDef(type)) return;

  const last = await prisma.pageSection.findFirst({
    where: { pageId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.pageSection.create({
    data: { pageId, type, order: (last?.order ?? -1) + 1, config: "{}" },
  });
  const page = await prisma.page.findUnique({ where: { id: pageId }, select: { slug: true } });
  revalidateSite(page?.slug);
}

export async function updateSection(sectionId: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const section = await prisma.pageSection.findUnique({ where: { id: sectionId }, include: { page: true } });
  if (!section) return { error: "Section not found." };

  const def = blockDef(section.type);
  const config: SectionConfig = {};
  for (const field of def?.fields ?? []) {
    if (field.type === "bool") {
      config[field.name] = bool(fd, field.name) as never;
    } else {
      const v = str(fd, field.name);
      if (v) config[field.name] = v as never;
    }
  }

  await prisma.pageSection.update({ where: { id: sectionId }, data: { config: JSON.stringify(config) } });
  revalidateSite(section.page.slug);
  redirect(`/admin/pages/${section.pageId}`);
}

export async function deleteSection(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const section = await prisma.pageSection.findUnique({ where: { id }, include: { page: true } });
  if (section) {
    await prisma.pageSection.delete({ where: { id } });
    revalidateSite(section.page.slug);
  }
}

export async function toggleSection(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const section = await prisma.pageSection.findUnique({ where: { id }, include: { page: true } });
  if (section) {
    await prisma.pageSection.update({ where: { id }, data: { isVisible: !section.isVisible } });
    revalidateSite(section.page.slug);
  }
}

export async function moveSection(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const dir = str(fd, "direction"); // "up" | "down"
  const section = await prisma.pageSection.findUnique({ where: { id }, include: { page: true } });
  if (!section) return;

  const neighbor = await prisma.pageSection.findFirst({
    where: {
      pageId: section.pageId,
      order: dir === "up" ? { lt: section.order } : { gt: section.order },
    },
    orderBy: { order: dir === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;

  await prisma.$transaction([
    prisma.pageSection.update({ where: { id: section.id }, data: { order: neighbor.order } }),
    prisma.pageSection.update({ where: { id: neighbor.id }, data: { order: section.order } }),
  ]);
  revalidateSite(section.page.slug);
}
