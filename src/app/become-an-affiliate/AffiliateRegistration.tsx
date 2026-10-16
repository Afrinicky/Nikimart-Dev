import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  BadgeCheck,
  BadgePercent,
  Link2,
  Palette,
  Tags,
  Wallet,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { JoinAffiliateForm } from "@/components/affiliate/JoinAffiliateForm";
import { auth } from "@/lib/auth";
import { isRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { getAffiliatePitch } from "@/lib/settings";
import { getAffiliateWorkspace } from "@/lib/affiliate-console";
import { getAffiliateReferralConfig } from "@/lib/affiliate-settings";
import { quoteAffiliateRegistration } from "@/lib/affiliate-registration";
import { teamRewardsLine } from "@/lib/affiliate-team-rules";
import type { AffiliateInviteLookup } from "@/lib/affiliate-invites";
import { inviteProblemMessage, inviteWaiverLabel } from "@/lib/data-bundles/invite-rules";

/**
 * The affiliate registration page.
 *
 * Built in the shape of the agent registration page, because they are the same
 * moment in somebody's day: one card, on its own, with the fee and the
 * discount stated before anything is asked of them, and what the account
 * actually is in four lines underneath. The old page was a marketing column
 * with the form at the bottom, which read as a brochure rather than a signup.
 *
 * What it must get right is the price. The fee, the waiver a recruiter's link
 * grants and the waiver a Nickimart link grants are all resolved on the server
 * and quoted here, and the same quote is recomputed when the form is submitted
 * — so a code edited in the address bar buys nothing, and nobody is ever shown
 * one number and charged another.
 */

/** Four lines, not four paragraphs — what the account actually is. */
const POINTS = [
  { icon: Tags, text: "The whole Nickimart catalogue to share from" },
  { icon: Palette, text: "A ready-made flyer for every product" },
  { icon: Link2, text: "Your own link and code on every share" },
  { icon: Wallet, text: "Commission after delivery, paid to MoMo" },
];

export async function AffiliateRegistration({
  referralCode,
  inviteLookup,
  paid = "",
}: {
  /** The recruiter's code from `?ref=`, normalised, or "". */
  referralCode: string;
  /** The Nickimart registration link they arrived on, already resolved. */
  inviteLookup: AffiliateInviteLookup | null;
  /** "1" or "pending" when they have just come back from the gateway. */
  paid?: string;
}) {
  const session = await auth();
  const [pitch, referral] = await Promise.all([
    getAffiliatePitch(),
    getAffiliateReferralConfig(),
  ]);

  const invite = inviteLookup?.ok
    ? { code: inviteLookup.invite.code, waiverPercent: inviteLookup.invite.waiverPercent }
    : null;
  // A link that has lapsed is worth saying out loud: silently charging full
  // price to somebody who was promised a discount is how support tickets start.
  const inviteNotice =
    inviteLookup && !inviteLookup.ok && inviteLookup.problem !== "unknown"
      ? inviteProblemMessage(inviteLookup.problem)
      : null;

  const offer = await quoteAffiliateRegistration({
    referralCode,
    inviteCode: invite?.code ?? null,
  });

  // Signed out: the account comes first, because a referral code has to
  // survive the detour through sign-in.
  if (!session?.user?.id) {
    const back = `/become-an-affiliate${query(referralCode, invite?.code)}`;
    return (
      <Shell
        title="Become an affiliate"
        subtitle={pitch}
        invite={invite}
        inviteNotice={inviteNotice}
      >
        <div className="rounded-2xl bg-niki-surface p-4">
          <p className="text-sm font-semibold text-niki-ink">
            {offer.quote.gross > 0
              ? offer.quote.payable > 0
                ? `Joining costs ${money(offer.quote.payable)}.`
                : "Joining is free on this link."
              : "Joining is free."}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-niki-ink/60">
            {referral.enabled ? teamRewardsLine(referral) : pitch}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/register?callbackUrl=${encodeURIComponent(back)}`}
            className="niki-press flex-1 rounded-full bg-niki-orange px-5 py-3 text-center text-sm font-bold text-white hover:bg-niki-orange-light"
          >
            Create a free account
          </Link>
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(back)}`}
            className="niki-press flex-1 rounded-full px-5 py-3 text-center text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
          >
            Sign in
          </Link>
        </div>
        <p className="mt-3 text-center text-xs text-niki-ink/45">
          You keep the same Nickimart account you shop with.
        </p>
      </Shell>
    );
  }

  const user = {
    id: session.user.id,
    name: session.user.name ?? null,
    role: isRole(session.user.role) ? session.user.role : "CUSTOMER",
  };
  const workspace = await getAffiliateWorkspace(user);

  // Already in: the console is where they meant to go.
  if (workspace.affiliate) redirect("/affiliate");

  const profile = await prisma.user
    .findUnique({ where: { id: user.id }, select: { phone: true } })
    .catch(() => null);

  const application = workspace.application;
  const waiting = application?.status === "pending";
  const declined = application?.status === "rejected";
  const owes = waiting && (application?.feeAmount ?? 0) > 0 && !application?.feePaidAt;

  if (waiting && !owes) {
    return (
      <Shell title="Application received" subtitle="We review these by hand, usually within a day.">
        {paid === "1" ? (
          <p className="mb-4 rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
            Your registration fee is paid. Thank you.
          </p>
        ) : null}
        {paid === "pending" ? (
          <p className="mb-4 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-niki-gold/30">
            We haven&apos;t had confirmation from the payment gateway yet. It usually lands within a
            minute, and your application moves on by itself when it does.
          </p>
        ) : null}
        <div className="rounded-2xl bg-niki-surface p-5">
          <p className="font-display font-bold text-niki-ink">Sent for review</p>
          <p className="mt-1 text-sm text-niki-ink/60">
            Submitted{" "}
            {application!.createdAt.toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            . Nothing else to do.
          </p>
          <Link
            href="/products"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange hover:underline"
          >
            Have a look round the catalogue <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </Shell>
    );
  }

  if (workspace.route === "closed") {
    return (
      <Shell title="Not open at the moment" subtitle="The programme opens again from time to time.">
        <div className="rounded-2xl bg-niki-surface p-5">
          <p className="text-sm text-niki-ink/65">
            If you sell on Nickimart or run a data bundle store, you are admitted automatically —
            set either up and come back.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/start-selling"
              className="niki-press rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
            >
              Start selling
            </Link>
            <Link
              href="/become-an-agent"
              className="niki-press rounded-full px-5 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
            >
              Sell data bundles
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Affiliate registration"
      subtitle={owes ? "Finish paying and your application goes straight into the queue." : pitch}
      invite={invite}
      inviteNotice={inviteNotice}
      standing={workspace.standing}
    >
      {declined ? (
        <p className="mb-4 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-800 ring-1 ring-niki-gold/30">
          Your last application wasn&apos;t approved
          {application?.decisionNote ? `: ${application.decisionNote}` : "."} You&apos;re welcome to
          apply again.
        </p>
      ) : null}

      <JoinAffiliateForm
        route={workspace.route === "auto" ? "auto" : "apply"}
        defaultName={user.name ?? ""}
        defaultPhone={profile?.phone ?? ""}
        referralCode={offer.referrer ? offer.referralCode : ""}
        referrerName={offer.referrer?.name ?? ""}
        invite={invite}
        fee={{
          gross: offer.quote.gross,
          waived: offer.quote.waived,
          waiverPercent: offer.quote.waiverPercent,
          payable: offer.quote.payable,
        }}
        paymentMode={offer.mode}
      />
    </Shell>
  );
}

/** The card everything on this page sits in. */
function Shell({
  title,
  subtitle,
  invite,
  inviteNotice,
  standing,
  children,
}: {
  title: string;
  subtitle: string;
  invite?: { code: string; waiverPercent: number } | null;
  inviteNotice?: string | null;
  standing?: { isSeller: boolean; isAgent: boolean; isAdmin: boolean };
  children: React.ReactNode;
}) {
  return (
    <div className="niki-gradient-hero min-h-[calc(100vh-4rem)] py-8 sm:py-10">
      <Container className="max-w-xl">
        <div className="mb-6 flex items-center justify-center gap-2">
          <BrandLogo className="h-7 w-auto text-niki-orange" />
          <span className="font-display text-lg font-bold text-white">
            Nick<span className="text-niki-orange">imart</span> Affiliates
          </span>
        </div>

        <div className="rounded-3xl bg-white p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div className="text-center">
            <h1 className="font-display text-xl font-bold text-niki-ink sm:text-2xl">{title}</h1>
            <p className="mt-1 text-sm text-niki-ink/60">{subtitle}</p>
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
            {standing?.isSeller || standing?.isAgent ? (
              <p className="mt-3 inline-flex items-start gap-2 rounded-xl bg-niki-surface px-3 py-2 text-xs text-niki-ink/70">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
                You already {standing.isAgent ? "run a data bundle store" : "sell"} on Nickimart, so
                you don&apos;t need to be reviewed again.
              </p>
            ) : null}
          </div>

          <div className="mt-6">{children}</div>
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

/** Carry the link they arrived on through sign-in, so the price survives it. */
function query(ref: string, invite?: string): string {
  const parts: string[] = [];
  if (ref) parts.push(`ref=${encodeURIComponent(ref)}`);
  if (invite) parts.push(`invite=${encodeURIComponent(invite)}`);
  return parts.length > 0 ? `?${parts.join("&")}` : "";
}

function money(amount: number): string {
  return `GH₵${amount.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
