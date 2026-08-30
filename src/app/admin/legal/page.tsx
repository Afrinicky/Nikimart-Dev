import type { Metadata } from "next";
import { ExternalLink, Scale } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PolicyEditor } from "@/components/admin/PolicyEditor";
import { getAllPolicies, getPolicyDraft, POLICY_SLUGS, toBody, POLICY_DEFAULTS } from "@/lib/legal";

export const metadata: Metadata = { title: "Policies — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Where the published policies are written.
 *
 * These are the documents buyers, sellers and agents are asked to accept before
 * they can register, so they need to be correctable without a deploy.
 */
export default async function AdminLegalPage() {
  const [policies, drafts] = await Promise.all([
    getAllPolicies(),
    Promise.all(POLICY_SLUGS.map((slug) => getPolicyDraft(slug))),
  ]);

  return (
    <Container className="max-w-3xl py-8">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-niki-black text-niki-orange">
          <Scale className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Policies</h1>
          <p className="mt-1 text-sm text-niki-ink/60">
            Terms, privacy, returns and the seller and agent policies. Saving publishes
            immediately — these are the documents people accept when they register.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        {policies.map((policy, i) => {
          const draft = drafts[i];
          if (!draft) return null;
          return (
            <PolicyEditor
              key={policy.slug}
              slug={policy.slug}
              title={draft.title}
              intro={draft.intro}
              body={draft.body}
              standardBody={toBody(POLICY_DEFAULTS[policy.slug].sections)}
              updatedAt={policy.updatedAt ? policy.updatedAt.toISOString() : null}
            />
          );
        })}
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-xs text-niki-ink/45">
        <ExternalLink className="h-3.5 w-3.5" />
        Every policy is published at /legal/&lt;name&gt; and linked from the footer.
      </p>
    </Container>
  );
}
