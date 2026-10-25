import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategorySidebar } from "@/components/medical/layout/CategorySidebar";
import { catalogueGridClass } from "@/lib/medical/catalogue-grid";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { ProductGrid } from "@/components/medical/product/ProductGrid";
import { CatalogueToolbar } from "@/components/medical/product/CatalogueToolbar";
import { Pager } from "@/components/medical/ui/Pager";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { getCategoryBySlug, getCategoryTree } from "@/lib/medical/categories";
import { getProductsInCategory, type CatalogueSort } from "@/lib/medical/catalogue";
import { isMedicalConfigured } from "@/lib/medical/db";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";

export const revalidate = 60;

const PER_PAGE = 24;

type Params = Promise<{ slug: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.metaTitle || category.name,
    description: category.metaDescription || category.description,
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: Search;
}) {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const { slug } = await params;
  const query = await searchParams;

  const page = toPage(query.page);
  const sort = toSort(query.sort);

  const [category, categories] = await Promise.all([
    getCategoryBySlug(slug),
    getCategoryTree({ sidebarOnly: true }),
  ]);
  if (!category) notFound();

  const { products, total } = await getProductsInCategory(slug, {
    take: PER_PAGE,
    skip: (page - 1) * PER_PAGE,
    orderBy: sort,
  });

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const sidebarCategories = categories.filter((entry) => entry.productCount > 0);

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs
        trail={[
          { href: "/medicals", label: "Home" },
          { href: "/medicals/categories", label: "Catalogue" },
          ...(category.parent
            ? [{ href: `/medicals/categories/${category.parent.slug}`, label: category.parent.name }]
            : []),
          { label: category.name },
        ]}
      />

      <div className={`mt-6 ${catalogueGridClass(sidebarCategories.length > 0, "lg:gap-8")}`}>
        <CategorySidebar
          categories={sidebarCategories}
          activeSlug={category.slug}
          className="hidden lg:block"
        />

        <div className="min-w-0">
          <header>
            <h1 className="medi-h1">{category.name}</h1>
            {category.description ? (
              <p className="medi-lede mt-2.5 text-medi-body">{category.description}</p>
            ) : null}
          </header>

          {/* Sub-categories as chips rather than a second sidebar. They are a
              filter on the page you are already looking at, and moving them
              into the left column would make two lists that look alike and do
              different things. */}
          {category.children.length > 0 ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {category.children.map((child) => (
                <li key={child.id}>
                  <MedicalLink
                    href={`/medicals/categories/${child.slug}`}
                    className="medi-focus inline-flex h-9 items-center rounded-full bg-medi-mint-50 px-3.5 text-[0.8125rem] font-medium text-medi-teal-800 transition-colors hover:bg-medi-mint-100"
                  >
                    {child.name}
                  </MedicalLink>
                </li>
              ))}
            </ul>
          ) : null}

          <Suspense fallback={<div className="mt-7 h-9" />}>
            <CatalogueToolbar total={total} showing={products.length} className="mt-7" />
          </Suspense>

          <div className="mt-4">
            <ProductGrid
              products={products}
              empty={{
                title: "Nothing listed here yet",
                body:
                  "We have not published anything in this part of the catalogue. We almost certainly can supply it — tell us what you need and we will price it.",
                action: (
                  <MedicalButtonLink href="/medicals/quotations/new">
                    Request a quotation
                  </MedicalButtonLink>
                ),
              }}
            />
          </div>

          <Pager
            page={page}
            pageCount={pageCount}
            hrefFor={(next) => hrefFor(next, sort)}
            className="mt-10"
          />
        </div>
      </div>
    </div>
  );
}

function hrefFor(page: number, sort: CatalogueSort): string {
  const params = new URLSearchParams();
  if (sort !== "relevance") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `?${query}` : "?";
}

/** A page number out of a URL is user input: anything but a positive integer is 1. */
function toPage(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

const SORTS: CatalogueSort[] = ["relevance", "price-asc", "price-desc", "newest", "name"];

function toSort(raw: string | string[] | undefined): CatalogueSort {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SORTS.includes(value as CatalogueSort) ? (value as CatalogueSort) : "relevance";
}
