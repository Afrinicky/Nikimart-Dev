import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPolicy, POLICY_SLUGS } from "@/lib/legal";

type Params = Promise<{ slug: string }>;

// Policies are editable in the admin, so a cached copy would keep publishing
// the old wording after a correction — the one thing a policy page must not do.
export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return POLICY_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  return { title: policy ? `${policy.title} — NikiMart` : "Policy — NikiMart" };
}

export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  const policy = await getPolicy(slug);
  if (!policy) notFound();

  return (
    <>
      <PageHeader
        title={policy.title}
        subtitle={policy.intro}
        crumbs={[{ label: "Legal" }, { label: policy.title }]}
      />
      <Container className="py-8">
        <div className="stagger-children mx-auto max-w-3xl space-y-5">
          {policy.sections.map((s, i) => (
            <section
              key={`${s.heading}-${i}`}
              className="rounded-2xl bg-white p-6 ring-1 ring-niki-edge-strong"
            >
              {s.heading ? (
                <h2 className="font-display text-lg font-bold text-niki-ink">{s.heading}</h2>
              ) : null}
              {s.body.split("\n\n").map((para, j) => (
                <p
                  key={j}
                  className={`text-sm leading-relaxed text-niki-ink/70 ${j === 0 && s.heading ? "mt-2" : j === 0 ? "" : "mt-3"}`}
                >
                  {para}
                </p>
              ))}
            </section>
          ))}

          <p className="text-xs text-niki-ink/45">
            {policy.updatedAt
              ? `Last updated ${policy.updatedAt.toLocaleDateString("en-GH", { day: "numeric", month: "long", year: "numeric" })}.`
              : "This is the current published version."}{" "}
            Questions about this policy? Contact NikiMart support.
          </p>
        </div>
      </Container>
    </>
  );
}
