import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowUpRight, BadgeCheck, Gift, Link2, Tags, Wallet } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { JoinAffiliateForm } from "@/components/affiliate/JoinAffiliateForm";
import { auth } from "@/lib/auth";
import { isRole } from "@/lib/roles";
import { getAffiliatePitch } from "@/lib/settings";
import { getAffiliateWorkspace } from "@/lib/affiliate-console";

export const metadata: Metadata = { title: "Become an affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The affiliate programme, for people who are not in it yet.
 *
 * Its own page, outside the console, for the same reason `/become-an-agent`
 * is: the console is a workspace with a sidebar that owns the window, and the
 * pitch is a marketing page that wants the shop's own header and footer around
 * it. Keeping both behind one address meant the storefront chrome had to
 * render over the console, which is what it was doing.
 *
 * Two screens, because two different people arrive here: somebody who has
 * never heard of the programme, and somebody signed in who wants to join.
 * Anybody who is already an affiliate is sent to their console.
 */
export default async function BecomeAnAffiliatePage() {
  const session = await auth();
  const pitch = await getAffiliatePitch();

  if (!session?.user?.id) return <PublicPitch pitch={pitch} />;

  const user = {
    id: session.user.id,
    name: session.user.name ?? null,
    role: isRole(session.user.role) ? session.user.role : "CUSTOMER",
  };
  const workspace = await getAffiliateWorkspace(user);

  // Already in: the console is where they meant to go.
  if (workspace.affiliate) redirect("/affiliate");

  return (
    <JoinScreen
      pitch={pitch}
      route={workspace.route}
      standing={workspace.standing}
      application={workspace.application}
      name={user.name ?? ""}
    />
  );
}

// ---------------------------------------------------------------------------
// Not signed in
// ---------------------------------------------------------------------------

function PublicPitch({ pitch }: { pitch: string }) {
  return (
    <>
      <PageHeader
        title="Become a Nickimart affiliate"
        subtitle="Earn commission for every sale you refer — no shop or stock needed."
        crumbs={[{ label: "Affiliate" }]}
      />
      <Container className="max-w-xl py-8">
        <div className="rounded-2xl bg-niki-black p-6 text-white">
          <div className="flex items-center gap-2 text-niki-orange">
            <Gift className="h-5 w-5" />
            <span className="font-display font-bold">Refer &amp; earn</span>
          </div>
          <p className="mt-2 text-sm text-white/70">
            <strong className="text-white">{pitch}</strong> Commission is set per product, so browse
            the catalogue, share the ones you like, and earn on every sale that comes through your
            link. Sign in or create a free account to get started.
          </p>
        </div>

        <ul className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Tags, title: "Pick products", body: "The whole Nickimart catalogue, with what each one pays." },
            { icon: Link2, title: "Share your link", body: "A flyer, a caption and your link — straight to WhatsApp." },
            { icon: Wallet, title: "Get paid", body: "Commission clears after delivery. Request a payout any time." },
          ].map((step) => (
            <li key={step.title} className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
              <step.icon className="h-5 w-5 text-niki-orange" />
              <p className="mt-2 font-display text-sm font-bold text-niki-ink">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-niki-ink/60">{step.body}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/register?callbackUrl=/affiliate"
            className="flex-1 rounded-full bg-niki-orange px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
          >
            Create a free account
          </Link>
          <Link
            href="/login?callbackUrl=/affiliate"
            className="flex-1 rounded-full px-5 py-3 text-center text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong transition-colors hover:bg-white"
          >
            Sign in
          </Link>
        </div>
      </Container>
    </>
  );
}

// ---------------------------------------------------------------------------
// Signed in, not an affiliate
// ---------------------------------------------------------------------------

function JoinScreen({
  pitch,
  route,
  standing,
  application,
  name,
}: {
  pitch: string;
  route: "auto" | "apply" | "closed";
  standing: { isSeller: boolean; isAgent: boolean; isAdmin: boolean };
  application: { id: string; status: string; createdAt: Date; decisionNote: string } | null;
  name: string;
}) {
  const waiting = application?.status === "pending";
  const declined = application?.status === "rejected";

  return (
    <>
      <PageHeader
        title={waiting ? "Application received" : "Become an affiliate"}
        subtitle={
          waiting
            ? "We're reviewing it now — you'll get access as soon as it's approved."
            : "Earn commission for every sale you refer to Nickimart."
        }
        crumbs={[{ label: "Affiliate" }]}
      />
      <Container className="max-w-2xl py-8">
        <div className="rounded-2xl bg-niki-black p-6 text-white">
          <div className="flex items-center gap-2 text-niki-orange">
            <Gift className="h-5 w-5" />
            <span className="font-display font-bold">Refer &amp; earn</span>
          </div>
          <p className="mt-2 text-sm text-white/70">
            <strong className="text-white">{pitch}</strong> You get a personal code, the whole
            Nickimart catalogue to share from, a flyer for every product, and commission on every
            sale referred through your links. No shop or stock needed.
          </p>
          {standing.isSeller || standing.isAgent ? (
            <p className="mt-3 flex items-start gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs text-white/80">
              <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-niki-orange" />
              You already {standing.isAgent ? "run a data bundle store" : "sell"} on Nickimart, so
              you don&apos;t need to be reviewed again.
            </p>
          ) : null}
        </div>

        {waiting ? (
          <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
            <p className="font-display font-bold text-niki-ink">Sent for review</p>
            <p className="mt-1 text-sm text-niki-ink/60">
              Submitted{" "}
              {application!.createdAt.toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . We review applications by hand, usually within a day. Nothing else to do.
            </p>
            <Link
              href="/products"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-orange hover:underline"
            >
              Have a look round the catalogue <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        ) : route === "closed" ? (
          <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
            <p className="font-display font-bold text-niki-ink">
              The programme isn&apos;t taking new affiliates right now
            </p>
            <p className="mt-1 text-sm text-niki-ink/60">
              It opens again from time to time. If you sell on Nickimart or run a data bundle store,
              you&apos;re admitted automatically — set either up and come back.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/start-selling"
                className="rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
              >
                Start selling
              </Link>
              <Link
                href="/become-an-agent"
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-white"
              >
                Sell data bundles
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
            {declined ? (
              <p className="mb-4 rounded-xl bg-niki-gold/15 px-4 py-3 text-sm text-amber-800 ring-1 ring-niki-gold/30">
                Your last application wasn&apos;t approved
                {application?.decisionNote ? `: ${application.decisionNote}` : "."} You&apos;re
                welcome to apply again.
              </p>
            ) : null}
            <JoinAffiliateForm route={route} defaultName={name} />
          </div>
        )}
      </Container>
    </>
  );
}
