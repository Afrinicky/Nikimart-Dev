import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { categoryIcon } from "@/lib/medical/icons";
import type { CategoryNode } from "@/lib/medical/categories";

/**
 * Every category, at a glance.
 *
 * Compact rows rather than another grid of picture cards: the product rails
 * above and below are already cards, and a third set of the same shape is what
 * makes a homepage read as one component repeated down the page. These are
 * dense, scannable and say how much is in each — which is what somebody
 * choosing a department actually wants.
 */
export function CategoryGrid({ categories }: { categories: CategoryNode[] }) {
  if (categories.length === 0) return null;

  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {categories.map((category) => {
        const Icon = categoryIcon(category.icon);
        return (
          <li key={category.id}>
            <MedicalLink
              href={`/medicals/categories/${category.slug}`}
              className="medi-focus group flex h-full items-start gap-3.5 rounded-xl bg-medi-mint-50 px-4 py-3.5 transition-colors hover:bg-medi-mint-100"
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-medi-teal-600 shadow-[inset_0_0_0_1px_var(--color-medi-rule)]">
                <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] font-semibold text-medi-ink transition-colors group-hover:text-medi-teal-800">
                  {category.name}
                </span>
                <span className="font-figures medi-meta mt-0.5 block text-medi-muted">
                  {category.productCount} {category.productCount === 1 ? "product" : "products"}
                </span>
              </span>
            </MedicalLink>
          </li>
        );
      })}
    </ul>
  );
}
