import type { Metadata } from "next";
import { Suspense } from "react";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { ProductGrid } from "@/components/medical/product/ProductGrid";
import { CatalogueToolbar } from "@/components/medical/product/CatalogueToolbar";
import { Pager } from "@/components/medical/ui/Pager";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { searchProducts, type CatalogueSort } from "@/lib/medical/catalogue";
import { isMedicalConfigured } from "@/lib/medical/db";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";

// Search reads the query string, so it is dynamic by nature; marking it so
// keeps Next from trying to prerender a page whose whole content is the query.
export const dynamic = "force-dynamic";

const PER_PAGE = 24;

export const metadata: Metadata = {
  title: "Search",
  // A search page in an index is a page of somebody else's query.
  robots: { index: false, follow: true },
};

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function SearchPage({ searchParams }: { searchParams: Search }) {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const query = await searchParams;
  const q = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? "";
  const page = toPage(query.page);
  const sort = toSort(query.sort);

  const { products, total } =
    q.length >= 2
      ? await searchProducts(q, { take: PER_PAGE, skip: (page - 1) * PER_PAGE, sort })
      : { products: [], total: 0 };

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs trail={[{ href: "/medicals", label: "Home" }, { label: "Search" }]} />

      <header className="mt-6">
        <h1 className="medi-h1">
          {q ? (
            <>
              Results for <span className="text-medi-teal-700">“{q}”</span>
            </>
          ) : (
            "Search the catalogue"
          )}
        </h1>
      </header>

      {q.length < 2 ? (
        <p className="medi-lede mt-3 text-medi-body">
          Type at least two characters. Catalogue numbers work as well as names —
          searching “HX-GLU-4100” will find it faster than “glucose reagent”.
        </p>
      ) : (
        <>
          <Suspense fallback={<div className="mt-7 h-9" />}>
            <CatalogueToolbar total={total} showing={products.length} className="mt-7" />
          </Suspense>

          <div className="mt-4">
            <ProductGrid
              products={products}
              empty={{
                title: `Nothing matches “${q}”`,
                body:
                  "Try the catalogue number on its own, or a shorter term. If we have not listed it, we can almost certainly still supply it — send us the details and we will price it.",
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
            hrefFor={(next) => hrefFor(q, next, sort)}
            className="mt-10"
          />
        </>
      )}
    </div>
  );
}

function hrefFor(q: string, page: number, sort: CatalogueSort): string {
  const params = new URLSearchParams({ q });
  if (sort !== "relevance") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  return `?${params.toString()}`;
}

function toPage(raw: string | string[] | undefined): number {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(value) && value > 0 ? value : 1;
}

const SORTS: CatalogueSort[] = ["relevance", "price-asc", "price-desc", "newest", "name"];

function toSort(raw: string | string[] | undefined): CatalogueSort {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return SORTS.includes(value as CatalogueSort) ? (value as CatalogueSort) : "relevance";
}
