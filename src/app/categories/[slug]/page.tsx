import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PackageSearch } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductGrid } from "@/components/product/ProductGrid";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  getCategoryBySlug,
  getProductsByCategoryId,
  getVendorNameMap,
} from "@/lib/catalog";

// Catalogue pages change when a seller edits a listing, not by the second, and
// they are the pages crawlers hit hardest, so one render should serve a minute
// of traffic rather than one visitor.
//
// This has no effect yet. The site header calls `auth()` to decide whether to
// say "Account" or "Sign in", and reading the session reads cookies, which
// makes every route in the app dynamic no matter what is set here. The header
// has to stop doing that on the server before any of these pages can be cached
// — see the note in src/components/layout/Header.tsx. Left in place because it
// is the right setting and becomes live the moment that changes.
export const revalidate = 60;


type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  return { title: category ? `${category.name} — Nickimart` : "Category — Nickimart" };
}

export default async function CategoryPage({ params }: { params: Params }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [items, vendorNames] = await Promise.all([
    getProductsByCategoryId(category.id),
    getVendorNameMap(),
  ]);

  return (
    <>
      <PageHeader
        title={category.name}
        subtitle={category.description}
        crumbs={[{ label: "Products", href: "/products" }, { label: category.name }]}
      />

      <Container className="py-8">
        {items.length > 0 ? (
          <ProductGrid products={items} vendorNames={vendorNames} />
        ) : (
          <EmptyState
            icon={<PackageSearch className="h-6 w-6" />}
            title="Nothing here yet"
            message={`We're adding more ${category.name} products soon. Check back shortly.`}
            actionLabel="Browse all products"
            actionHref="/products"
          />
        )}
      </Container>
    </>
  );
}
