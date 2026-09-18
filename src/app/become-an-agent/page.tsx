import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BadgePercent, Banknote, Link2, Store, Tags } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { ApplyAgentForm } from "@/components/agent/ApplyAgentForm";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { siteUrl } from "@/lib/site";
import {
  getAgentProgramConfig,
  getDataStoreConfig,
  getReferralConfig,
} from "@/lib/data-bundles/settings";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { recruitPaymentMode, resolveReferralCode } from "@/lib/data-bundles/referrals";
import { resolveAgentInvite } from "@/lib/data-bundles/invites";
import { inviteProblemMessage, inviteWaiverLabel } from "@/lib/data-bundles/invite-rules";

export const metadata: Metadata = {
  title: "Become a Data Agent — Nickimart",
  description:
    "Open your own data bundle storefront under Nickimart. Set your own prices, sell to your customers, and earn on every bundle.",
};

export const dynamic = "force-dynamic";

/** Four lines, not four paragraphs — what the account actually is. */
const POINTS = [
  { icon: Store, text: "Your own storefront at nickimart.com/store/yourname" },
  { icon: Tags, text: "You set your own prices on every bundle" },
  { icon: Link2, text: "Share one link; customers buy and pay on it" },
  { icon: Banknote, text: "Commission on delivery, withdrawn to MoMo" },
];

export default async function BecomeAnAgentPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; invite?: string }>;
}) {
  const session = await auth();
  const [program, store, referral] = await Promise.all([
    getAgentProgramConfig(),
    getDataStoreConfig(),
    getReferralConfig(),
  ]);

  // An invite link carries the recruiter's agent code. It only prefills the
  // field — the code is resolved and checked server-side when the application
  // is submitted, and again when it is approved, so a link somebody edited
  // buys nothing.
  const params = await searchParams;
  const invitedBy = (params?.ref ?? "").trim().toUpperCase().slice(0, 20);

  // A registration link Nickimart issued itself. Resolved here so the fee on
  // the form is the fee they will be charged — and re-resolved on submit, so a
  // link edited in the address bar buys nothing.
  const inviteLookup = params?.invite ? await resolveAgentInvite(params.invite) : null;
  const invite = inviteLookup?.ok
    ? {
        code: inviteLookup.invite.code,
        waiverPercent: inviteLookup.invite.waiverPercent,
        label: inviteLookup.invite.label,
      }
    : null;
  // A link that has lapsed is worth saying out loud: silently charging full
  // price to somebody who was promised a discount is how support tickets start.
  const inviteNotice =
    inviteLookup && !inviteLookup.ok && inviteLookup.problem !== "unknown"
      ? inviteProblemMessage(inviteLookup.problem)
      : null;

  // How this applicant may settle the fee. Their recruiter can have an
  // arrangement of their own where the admin has allowed it, so the choice the
  // form offers is resolved against the code they arrived on rather than read
  // straight off the programme — the same resolution the submit enforces.
  const resolved = invitedBy ? await resolveReferralCode(invitedBy) : null;
  const paymentMode = await recruitPaymentMode(resolved?.ok ? resolved.agentId : null);

  // Already an agent? There's nothing to pitch — send them to their console.
  let signedInAs: { name: string; email: string; phone: string } | null = null;
  if (session?.user?.id) {
    const existing = await getAgentForUser(session.user.id);
    if (existing) redirect("/agent");

    // Signed in but not an agent: the storefront is added to the account they
    // already have, so the form doesn't ask them to invent a second password.
    const profile = await prisma.user
      .findUnique({
        where: { id: session.user.id },
        select: { name: true, email: true, phone: true },
      })
      .catch(() => null);
    if (profile?.email) {
      signedInAs = {
        name: profile.name ?? "",
        email: profile.email,
        phone: profile.phone ?? "",
      };
    }
  }

  const open = program.enabled && store.enabled;

  return (
    <div className="niki-gradient-hero min-h-[calc(100vh-4rem)] py-10">
      <Container className="max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <BrandLogo className="h-7 w-auto text-niki-orange" />
          <span className="font-display text-lg font-bold text-white">
            Nick<span className="text-niki-orange">imart</span> Data
          </span>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-2xl shadow-black/20 sm:p-8">
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-niki-ink">Agent registration</h1>
            <p className="mt-1 text-sm text-niki-ink/60">
              Create your account and start selling data bundles.
            </p>
            {invite ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-niki-success/10 px-3 py-1.5 text-sm font-semibold text-niki-success ring-1 ring-niki-success/30">
                <BadgePercent className="h-4 w-4" />
                {inviteWaiverLabel(invite.waiverPercent) || "You were invited by Nickimart."}
              </p>
            ) : null}
            {inviteNotice ? (
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                {inviteNotice}
              </p>
            ) : null}
          </div>

          <div className="mt-6">
            {!open ? (
              <div className="rounded-2xl bg-niki-surface px-5 py-8 text-center">
                <p className="font-display font-bold text-niki-ink">
                  {program.enabled ? "Temporarily closed" : "Signup is closed"}
                </p>
                <p className="mt-1 text-sm text-niki-ink/60">
                  We&apos;re not taking new agents right now. Please check back soon.
                </p>
              </div>
            ) : (
              <ApplyAgentForm
                origin={siteUrl()}
                referralCode={invitedBy}
                invite={invite}
                setupFee={program.setupFee}
                referralOpen={referral.enabled}
                paymentMode={paymentMode}
                signedInAs={signedInAs}
              />
            )}
          </div>
        </div>

        {/* What the account is, once. Anything longer belongs on a help page. */}
        <ul className="mt-6 grid gap-2 sm:grid-cols-2">
          {POINTS.map((p) => (
            <li
              key={p.text}
              className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-3 text-xs text-white/70 ring-1 ring-white/10"
            >
              <p.icon className="h-4 w-4 shrink-0 text-niki-gold" />
              {p.text}
            </li>
          ))}
        </ul>
      </Container>
    </div>
  );
}
