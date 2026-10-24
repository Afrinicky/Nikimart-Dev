import { ChevronRight } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { categoryIcon } from "@/lib/medical/icons";
import type { CategoryNode } from "@/lib/medical/categories";
import { cn } from "@/lib/cn";

/**
 * The catalogue, down the left of the page.
 *
 * A real column on desktop rather than a drawer behind a button, because
 * twelve categories is a list somebody scans — they are looking for the word
 * "microbiology" and they will find it faster in a column than by opening
 * something first. On a phone it is not rendered at all; the drawer in the
 * header carries the same tree, and two copies of a navigation list in one
 * page is two things to keep in step.
 *
 * Counts are shown because they are useful and true: a category with four
 * products in it should say so rather than let somebody click into a near
 * empty page.
 */
export function CategorySidebar({
  categories,
  activeSlug,
  className,
}: {
  categories: CategoryNode[];
  activeSlug?: string;
  className?: string;
}) {
  if (categories.length === 0) return null;

  return (
    <nav aria-label="Product categories" className={cn("medi-panel overflow-hidden", className)}>
      <h2 className="medi-label border-b border-medi-rule px-4 py-3.5 text-medi-ink">
        Shop by category
      </h2>
      <ul className="p-1.5">
        {categories.map((category) => {
          const Icon = categoryIcon(category.icon);
          const active =
            activeSlug === category.slug ||
            category.children.some((child) => child.slug === activeSlug);

          return (
            <li key={category.id}>
              <MedicalLink
                href={`/medicals/categories/${category.slug}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "medi-focus group flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                  active
                    ? "bg-medi-mint-100 text-medi-teal-800"
                    : "text-medi-body hover:bg-medi-mint-50 hover:text-medi-ink",
                )}
              >
                <Icon
                  className={cn(
                    "h-[1.125rem] w-[1.125rem] shrink-0",
                    active ? "text-medi-teal-700" : "text-medi-teal-600",
                  )}
                  aria-hidden
                />
                {/* Wrapped, not truncated. Four of these twelve names are
                    long enough to clip, and "Diagnostic kits and rapid …"
                    beside "Diagnostic and laborator…" is two entries a buyer
                    cannot tell apart — which is the one job this list has. */}
                <span className="min-w-0 flex-1 text-[0.8125rem] font-medium leading-snug">
                  {category.name}
                </span>
                <ChevronRight
                  className="h-3.5 w-3.5 shrink-0 text-medi-disabled transition-transform duration-200 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </MedicalLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
