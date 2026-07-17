import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_ABOUT_SECTIONS,
  DEFAULT_HOME_SECTIONS,
  type SectionConfig,
  type SectionType,
} from "@/lib/page-blocks";

export interface RenderSection {
  id: string;
  type: SectionType;
  config: SectionConfig;
  isVisible: boolean;
}

function parseConfig(value: string): SectionConfig {
  try {
    return JSON.parse(value) as SectionConfig;
  } catch {
    return {};
  }
}

const DEFAULTS: Record<string, { title: string; sections: typeof DEFAULT_HOME_SECTIONS }> = {
  home: { title: "Home", sections: DEFAULT_HOME_SECTIONS },
  about: { title: "About", sections: DEFAULT_ABOUT_SECTIONS },
};

/**
 * Loads a page's visible sections for rendering. Falls back to the built-in
 * defaults when the DB has no such page — and stays resilient if the page
 * tables don't exist yet (e.g. before the migration is applied in prod).
 */
export const getRenderSections = cache(async (slug: string): Promise<RenderSection[] | null> => {
  try {
    const page = await prisma.page.findUnique({
      where: { slug },
      include: { sections: { orderBy: { order: "asc" } } },
    });
    if (page) {
      if (!page.isPublished) return null;
      return page.sections
        .filter((s) => s.isVisible)
        .map((s) => ({
          id: s.id,
          type: s.type as SectionType,
          config: parseConfig(s.config),
          isVisible: s.isVisible,
        }));
    }
  } catch {
    // page tables not migrated yet — fall through to defaults
  }

  const fallback = DEFAULTS[slug];
  if (!fallback) return null;
  return fallback.sections.map((s, i) => ({
    id: `default-${i}`,
    type: s.type,
    config: s.config,
    isVisible: true,
  }));
});

/** Admin: full page record with all sections (including hidden). */
export async function getPageWithSections(id: string) {
  return prisma.page.findUnique({
    where: { id },
    include: { sections: { orderBy: { order: "asc" } } },
  });
}

export async function listPages() {
  try {
    return await prisma.page.findMany({
      orderBy: [{ isSystem: "desc" }, { title: "asc" }],
      include: { _count: { select: { sections: true } } },
    });
  } catch {
    return [];
  }
}
