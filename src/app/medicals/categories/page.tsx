import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { categoryIcon } from "@/lib/medical/icons";
import { getCategoryTree } from "@/lib/medical/categories";
import { isMedicalConfigured } from "@/lib/medical/db";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Catalogue",
  description:
    "Every department Nickimart Medical supplies: reagents, consumables, microbiology, diagnostics, blood collection, equipment, surgical instruments and protective equipment.",
};

export default async function CataloguePage() {
  if (!isMedicalConfigured()) return <NotConfigured />;
  const categories = await getCategoryTree();

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs trail={[{ href: "/medicals", label: "Home" }, { label: "Catalogue" }]} />

      <header className="mt-6 max-w-2xl">
        <h1 className="medi-h1">The catalogue</h1>
        <p className="medi-lede mt-2.5 text-medi-body">
          Twelve departments. What is listed is what we have published — if you
          cannot find something, ask, because we source to order both locally and
          internationally.
        </p>
      </header>

      {/* Each department with its sub-categories listed under it, rather than
          twelve tiles that each need a click to find out what is inside. */}
      <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const Icon = categoryIcon(category.icon);
          return (
            <section key={category.id}>
              <h2 className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-medi-mint-50 text-medi-teal-600">
                  <Icon className="h-[1.125rem] w-[1.125rem]" aria-hidden />
                </span>
                <MedicalLink
                  href={`/medicals/categories/${category.slug}`}
                  className="medi-focus rounded text-[0.9375rem] font-semibold leading-snug text-medi-ink transition-colors hover:text-medi-teal-700"
                >
                  {category.name}
                  <span className="font-figures medi-meta mt-0.5 block font-medium text-medi-muted">
                    {category.productCount} {category.productCount === 1 ? "product" : "products"}
                  </span>
                </MedicalLink>
              </h2>

              {category.children.length > 0 ? (
                <ul className="mt-3 space-y-1.5 pl-[2.9375rem]">
                  {category.children.map((child) => (
                    <li key={child.id}>
                      <MedicalLink
                        href={`/medicals/categories/${child.slug}`}
                        className="medi-focus rounded text-[0.8125rem] text-medi-body transition-colors hover:text-medi-teal-700"
                      >
                        {child.name}
                      </MedicalLink>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
