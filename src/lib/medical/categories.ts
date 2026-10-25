import "server-only";
import { medicalDb, readMedical } from "@/lib/medical/db";

/**
 * The category tree.
 *
 * Twelve top-level categories, each with a handful of children. Small enough
 * that the whole tree is fetched in one query and assembled in memory rather
 * than walked with a recursive CTE, and small enough that the sidebar can show
 * all of it without a "more" control.
 */

export interface CategoryNode {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  image: string | null;
  /** How many listable products are filed under this category and its children. */
  productCount: number;
  children: CategoryNode[];
}

export async function getCategoryTree(
  options: { sidebarOnly?: boolean } = {},
): Promise<CategoryNode[]> {
  return readMedical(async () => {
    const [rows, counts] = await Promise.all([
      // Always the whole tree, even when only the sidebar entries will be
      // shown. A parent's count is the sum of its children's, and most
      // products are filed against a child rather than the parent — so
      // filtering the children out of the *query* makes every parent count
      // zero. That is what happened: six of the twelve departments vanished
      // from the sidebar, because `productCount > 0` is how the caller hides
      // empty ones. `showInSidebar` decides what is displayed, below; it must
      // not decide what is counted.
      medicalDb.medicalCategory.findMany({
        where: { isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          icon: true,
          image: true,
          parentId: true,
          position: true,
          showInSidebar: true,
        },
        orderBy: [{ position: "asc" }, { name: "asc" }],
      }),
      medicalDb.medicalProduct.groupBy({
        by: ["categoryId"],
        where: { status: "ACTIVE" },
        _count: { _all: true },
      }),
    ]);

    const directCount = new Map(counts.map((c) => [c.categoryId, c._count._all]));
    const sidebarFlags = new Map(rows.map((row) => [row.id, row.showInSidebar]));
    const byParent = new Map<string | null, typeof rows>();
    for (const row of rows) {
      const list = byParent.get(row.parentId) ?? [];
      list.push(row);
      byParent.set(row.parentId, list);
    }

    const build = (parentId: string | null): CategoryNode[] =>
      (byParent.get(parentId) ?? []).map((row) => {
        const children = build(row.id);
        return {
          id: row.id,
          slug: row.slug,
          name: row.name,
          description: row.description,
          icon: row.icon,
          image: row.image,
          // A parent's count includes everything beneath it. A category that
          // reads "0" while its children hold forty products looks broken.
          productCount:
            (directCount.get(row.id) ?? 0) +
            children.reduce((total, child) => total + child.productCount, 0),
          children,
        };
      });

    const tree = build(null);
    return options.sidebarOnly
      ? tree.filter((node) => sidebarFlags.get(node.id) !== false)
      : tree;
  }, []);
}

export async function getCategoryBySlug(slug: string) {
  return readMedical(
    () =>
      medicalDb.medicalCategory.findFirst({
        where: { slug, isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          icon: true,
          image: true,
          metaTitle: true,
          metaDescription: true,
          parent: { select: { slug: true, name: true } },
          children: {
            where: { isActive: true },
            select: { id: true, slug: true, name: true, icon: true },
            orderBy: [{ position: "asc" }, { name: "asc" }],
          },
        },
      }),
    null,
  );
}
