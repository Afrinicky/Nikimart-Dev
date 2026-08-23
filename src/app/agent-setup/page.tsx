import type { Metadata } from "next";
import { AlertTriangle } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ActionLink } from "@/components/ui/motion";
import { AgentSetupForm } from "@/components/agent/AgentSetupForm";
import { getSetupApplication } from "@/lib/data-bundles/agent-application-actions";
import { getAgentProgramConfig } from "@/lib/settings";
import { siteUrl } from "@/lib/site";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Set up your agent account — NikiMart" };
export const dynamic = "force-dynamic";

/**
 * The one-time setup link an approved applicant receives.
 *
 * Deliberately outside the /agent shell, and outside the /agent path entirely:
 * the account exists but has no password yet, so the person following this link
 * cannot be signed in. Under /agent the middleware would bounce them to /login
 * and the agent layout would bounce them to /become-an-agent — either way the
 * approval link would dead-end at the last step.
 */
export default async function AgentSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const [application, program] = await Promise.all([
    getSetupApplication((token ?? "").trim()),
    getAgentProgramConfig(),
  ]);

  return (
    <>
      <PageHeader
        title="Set up your agent account"
        subtitle="One step left — choose a password and your store goes live."
        crumbs={[{ label: "Become an agent", href: "/become-an-agent" }, { label: "Set up" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-lg">
          {!application ? (
            <div className="rounded-3xl bg-white p-8 text-center ring-1 ring-niki-edge">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <p className="mt-4 font-display text-lg font-bold text-niki-ink">
                This link isn&apos;t valid any more
              </p>
              <p className="mt-2 text-sm text-niki-ink/60">
                Setup links work once and expire after seven days. If you&apos;ve already used it,
                just sign in. Otherwise ask support for a new one.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <ActionLink
                  href="/login?callbackUrl=%2Fagent"
                  className="rounded-full bg-niki-navy px-5 py-2.5 text-sm font-semibold text-white"
                >
                  Sign in
                </ActionLink>
                <ActionLink
                  href="/become-an-agent"
                  className="rounded-full bg-niki-surface px-5 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge"
                >
                  Back to the programme
                </ActionLink>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
              <AgentSetupForm
                token={(token ?? "").trim()}
                fullName={application.fullName}
                email={application.email}
                slug={application.desiredSlug}
                origin={siteUrl()}
              />
              <p className="mt-5 border-t border-niki-edge pt-4 text-xs leading-relaxed text-niki-ink/50">
                Your storefront cost {formatMoney(program.setupFee)}, already charged to your
                balance rather than to you — it clears itself out of the commission you earn, so
                there is nothing to pay up front.
              </p>
            </div>
          )}
        </div>
      </Container>
    </>
  );
}
