import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Snowflake, Thermometer } from "lucide-react";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";
import { SectionHead } from "@/components/medical/ui/SectionHead";
import { ProductGallery } from "@/components/medical/product/ProductGallery";
import { ProductPurchasePanel } from "@/components/medical/product/ProductPurchasePanel";
import { ProductRail } from "@/components/medical/product/ProductRail";
import { SaveButton } from "@/components/medical/account/SaveButton";
import {
  getProductBySlug,
  getRelatedProducts,
  parseDocuments,
  parseSpecifications,
  parseStringList,
  toProductSummary,
} from "@/lib/medical/catalogue";
import { isMedicalConfigured } from "@/lib/medical/db";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";

export const revalidate = 60;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.metaTitle || product.name,
    description: product.metaDescription || product.summary || product.description.slice(0, 160),
  };
}

export default async function ProductPage({ params }: { params: Params }) {
  if (!isMedicalConfigured()) return <NotConfigured />;

  const { slug } = await params;
  const row = await getProductBySlug(slug);
  if (!row) notFound();

  const product = toProductSummary(row as never);
  const specifications = parseSpecifications(row.specifications);
  const compatibleWith = parseStringList(row.compatibleWith);
  const documents = parseDocuments(row.documents);
  const related = await getRelatedProducts(row.category.id, row.id);

  // The lower half splits into two columns only when the right one has
  // something in it. Most products have neither a verified-compatibility list
  // nor published documents, and an empty right column squeezes the
  // specifications into 55% of the width for no reason at all.
  const hasAside = compatibleWith.length > 0 || documents.length > 0;

  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs
        trail={[
          { href: "/medicals", label: "Home" },
          { href: "/medicals/categories", label: "Catalogue" },
          ...(row.category.parent
            ? [
                {
                  href: `/medicals/categories/${row.category.parent.slug}`,
                  label: row.category.parent.name,
                },
              ]
            : []),
          { href: `/medicals/categories/${row.category.slug}`, label: row.category.name },
          { label: product.name },
        ]}
      />

      <div className="mt-6 grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
        <ProductGallery images={row.images} name={product.name} />

        <div className="min-w-0">
          <p className="medi-meta flex flex-wrap items-center gap-x-2 gap-y-1 text-medi-muted">
            {product.manufacturerName ? <span>{product.manufacturerName}</span> : null}
            {product.manufacturerName && product.catalogueNumber ? (
              <span aria-hidden>·</span>
            ) : null}
            {product.catalogueNumber ? (
              <span className="font-figures">
                Cat. no. <span className="font-semibold text-medi-body">{product.catalogueNumber}</span>
              </span>
            ) : null}
          </p>

          <h1 className="medi-h1 mt-2">{product.name}</h1>

          {product.summary ? (
            <p className="medi-lede mt-3 text-medi-body">{product.summary}</p>
          ) : null}

          {/* Handling facts go above the buy button, not in a tab below it. A
              reagent that has to travel at 2–8 °C is something the customer has
              to know before they order, not after. */}
          {(product.requiresColdChain || row.restrictedSale || row.hazardClass) ? (
            <ul className="mt-5 space-y-2">
              {product.requiresColdChain ? (
                <Flag
                  icon={<Snowflake className="h-4 w-4" aria-hidden />}
                  tone="info"
                  text="Cold chain. Shipped in insulated packaging, and only to an address that can receive it."
                />
              ) : null}
              {row.restrictedSale ? (
                <Flag
                  icon={<AlertTriangle className="h-4 w-4" aria-hidden />}
                  tone="warning"
                  text={
                    row.restrictionNote ||
                    "Restricted. We will confirm your facility details before supplying this."
                  }
                />
              ) : null}
              {row.hazardClass ? (
                <Flag
                  icon={<Thermometer className="h-4 w-4" aria-hidden />}
                  tone="warning"
                  text={`${row.hazardClass}. Carried under dangerous-goods rules; some destinations are restricted.`}
                />
              ) : null}
            </ul>
          ) : null}

          <div className="mt-6">
            <ProductPurchasePanel product={product} />
            {/* Its own state is resolved in the browser: this page is cached
                for a minute and served to everybody, so there is no session
                here to read. */}
            <SaveButton productId={product.id} className="mt-3" />
          </div>
        </div>
      </div>

      <div
        className={
          hasAside
            ? "mt-14 grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-12"
            : "mt-14 max-w-3xl"
        }
      >
        <div className="min-w-0 space-y-10">
          {row.description ? (
            <section aria-labelledby="description">
              <h2 id="description" className="medi-h3">
                About this product
              </h2>
              <p className="medi-prose mt-3 text-[0.9375rem] text-medi-body">{row.description}</p>
            </section>
          ) : null}

          {specifications.length > 0 ? (
            <section aria-labelledby="specifications">
              <h2 id="specifications" className="medi-h3">
                Specifications
              </h2>
              {/* A description list, not a table: two columns of label and
                  value is what a dl is, and a table here would announce row and
                  column positions nobody needs. */}
              <dl className="mt-3 divide-y divide-medi-rule border-y border-medi-rule">
                {specifications.map((spec) => (
                  <div
                    key={spec.label}
                    className="grid grid-cols-[minmax(0,11rem)_1fr] gap-4 py-3"
                  >
                    <dt className="text-[0.875rem] text-medi-muted">{spec.label}</dt>
                    <dd className="text-[0.875rem] font-medium text-medi-ink">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {row.handlingNotes ? (
            <section aria-labelledby="handling">
              <h2 id="handling" className="medi-h3">
                Storage and handling
              </h2>
              <p className="medi-prose mt-3 text-[0.9375rem] text-medi-body">{row.handlingNotes}</p>
            </section>
          ) : null}
        </div>

        {hasAside ? (
        <div className="space-y-10">
          {compatibleWith.length > 0 ? (
            <section aria-labelledby="compatibility">
              <h2 id="compatibility" className="medi-h3">
                Verified compatibility
              </h2>
              <ul className="mt-3 space-y-1.5">
                {compatibleWith.map((entry) => (
                  <li key={entry} className="flex gap-2.5 text-[0.875rem] text-medi-body">
                    <span className="mt-[0.4375rem] h-1 w-1 shrink-0 rounded-full bg-medi-teal-500" aria-hidden />
                    {entry}
                  </li>
                ))}
              </ul>
              {/* Stated, because an unverified compatibility claim on a reagent
                  is how a laboratory loses a run. */}
              <p className="medi-meta mt-3 text-medi-muted">
                Only what the manufacturer states. If your analyser is not listed,
                ask us before ordering.
              </p>
            </section>
          ) : null}

          {documents.length > 0 ? (
            <section aria-labelledby="documents">
              <h2 id="documents" className="medi-h3">
                Documents
              </h2>
              <ul className="mt-3 space-y-2">
                {documents.map((doc) => (
                  <li key={doc.url}>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="medi-focus rounded text-[0.875rem] font-medium text-medi-teal-700 underline-offset-4 hover:underline"
                    >
                      {doc.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        ) : null}
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related" className="mt-16">
          <SectionHead
            as="h2"
            title={`More in ${row.category.name}`}
            href={`/medicals/categories/${row.category.slug}`}
          />
          <ProductRail products={related} className="mt-7" />
        </section>
      ) : null}
    </div>
  );
}

function Flag({
  icon,
  text,
  tone,
}: {
  icon: React.ReactNode;
  text: string;
  tone: "info" | "warning";
}) {
  return (
    <li
      className={
        tone === "info"
          ? "flex gap-2.5 rounded-xl bg-medi-info-soft px-3.5 py-3 text-[0.8125rem] text-medi-info"
          : "flex gap-2.5 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-[0.8125rem] text-medi-warning"
      }
    >
      <span className="mt-px shrink-0">{icon}</span>
      <span className="font-medium">{text}</span>
    </li>
  );
}
