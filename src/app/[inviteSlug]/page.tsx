import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentRegistration } from "../become-an-agent/AgentRegistration";
import { resolveAgentInviteBySlug, type InviteLookup } from "@/lib/data-bundles/invites";
import { inviteProblem } from "@/lib/data-bundles/invite-rules";

/**
 * A registration link short enough to advertise: nickimart.com/join.
 *
 * Why this route exists at all. The link the admin console issues is
 * `/become-an-agent?invite=ABCD2345`, and Facebook and WhatsApp refuse it — a
 * query string on a domain their checks don't recognise is the shape of a
 * tracking redirect, so the advert never runs. A bare path is the same link
 * without the shape they object to, and it is the same database row: the same
 * fee, the same cap on uses, the same expiry, the same on/off switch, set in
 * the same place by the same admin.
 *
 * It renders the registration page directly rather than redirecting to the long
 * URL. A redirect would put the query string back in the address bar, which is
 * then what people copy out of it and share on — and what a crawler following
 * the link would see and object to. Landing here *is* the point.
 *
 * On being a dynamic segment at the root. A short path an admin invents at
 * runtime cannot be a folder in this tree, so it has to be matched dynamically,
 * and the only place a one-segment path can be matched is here. Next.js resolves
 * a static segment before a dynamic one, so every existing page — /login,
 * /register, /products — still answers first and is unreachable as a short path;
 * the reserved list in invite-rules refuses those names at the moment a link is
 * created, so an admin is told then rather than left with a link that quietly
 * goes somewhere else.
 *
 * The cost of that, stated plainly: a one-segment path nobody claims now reaches
 * this route and answers 200 with the site's not-found page, where before it had
 * no route at all and answered 404. `notFound()` does not set the status in this
 * version of Next — a page whose only statement is `notFound()` answers 200 too,
 * which is why /pages/x, /shops/x and every other dynamic route here already
 * behave this way. What is left to do about it is tell crawlers not to index the
 * miss, which generateMetadata below does; a wrong path still renders exactly
 * the page it rendered before.
 */

export const dynamic = "force-dynamic";

type Params = Promise<{ inviteSlug: string }>;
type Search = Promise<{ ref?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { inviteSlug } = await params;
  const invite = await resolveAgentInviteBySlug(inviteSlug);
  // No link claims this path, so the page below is the site's not-found page.
  // Said out loud here because the status code cannot say it: without this, a
  // mistyped address would be a page a search engine is willing to index.
  if (!invite) {
    return { title: "Page not found — Nickimart", robots: { index: false, follow: false } };
  }

  return {
    title: "Agent registration — Nickimart",
    description:
      "Open your own data bundle storefront under Nickimart. Set your own prices, sell to your customers, and earn on every bundle.",
    // The short path is the canonical address of this link. Adverts and shares
    // point here, so a preview card that named the long URL instead would send
    // people to the address the advert could not use in the first place.
    alternates: { canonical: `/${invite.slug ?? inviteSlug}` },
  };
}

export default async function InviteSlugPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams?: Search;
}) {
  const { inviteSlug } = await params;
  const invite = await resolveAgentInviteBySlug(inviteSlug);
  if (!invite) notFound();

  // Lapsed, switched off, or used up is not a 404. An advert that has already
  // run keeps being clicked for weeks, and the page says what happened and
  // offers the normal fee — exactly as the long link does for the same code.
  const problem = inviteProblem(invite);
  const inviteLookup: InviteLookup = problem ? { ok: false, problem } : { ok: true, invite };

  // A recruiter's code still works on a short link, so one agent can share the
  // advert's URL and keep their referral.
  const params2 = await searchParams;

  return (
    <AgentRegistration
      referralCode={(params2?.ref ?? "").trim().toUpperCase().slice(0, 20)}
      inviteLookup={inviteLookup}
    />
  );
}
