import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ContentPage } from "@/components/medical/ui/ContentPage";
import { PolicySections } from "@/components/medical/ui/PolicyBody";
import { getPolicy, POLICY_SLUGS } from "@/lib/legal";

type Params = Promise<{ slug: string }>;

// Editable in the console, so a cached copy would keep publishing the old
// wording after a correction — the one thing a policy page must not do.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  return { title: policy?.title ?? "Policy" };
}

/**
 * Nickimart's published policies, in the medical surface.
 *
 * The same documents the mall publishes, read from the same place: one
 * company, one set of terms, edited in one console. A separate medical copy
 * would drift, and the drift would only be noticed in a dispute.
 */
export default async function MedicalLegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <ContentPage
      title={policy.title}
      lede={policy.intro}
      crumbs={[{ href: "/medicals", label: "Home" }, { label: policy.title }]}
    >
      <PolicySections sections={policy.sections} updatedAt={policy.updatedAt} />
    </ContentPage>
  );
}
