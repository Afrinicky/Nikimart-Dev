import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { AgentLoginForm } from "@/components/agent/AgentLoginForm";
import { dataAuth } from "@/lib/data-bundles/auth";
import { DATA_ROLE_HOME, isDataRole } from "@/lib/data-bundles/roles";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Agent sign in — NikiMart Data",
};

/**
 * The bundle business's own front door.
 *
 * Outside /agent on purpose: everything under that path is behind the console
 * guard, and a sign-in page that redirects people to itself is the loop this
 * codebase has already been bitten by. It sits beside /agent-setup and
 * /become-an-agent, which are the other two pages somebody reaches before they
 * have a console to go to.
 *
 * It reads nothing from the mall. An agent can sign in here with the retail
 * database switched off, which is the whole reason it exists.
 */
export default async function AgentLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // A session read that throws must not replace the page with the error
  // boundary: this is the way back in, and a dead end here has no way forward.
  const session = await dataAuth().catch((error: unknown) => {
    console.error("[data-auth] could not read the session on /agent-login:", error);
    return null;
  });
  const { callbackUrl } = await searchParams;
  const cb =
    callbackUrl && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//")
      ? callbackUrl
      : undefined;

  if (session?.user) {
    const role = isDataRole(session.user.role) ? session.user.role : "AGENT";
    redirect(cb ?? DATA_ROLE_HOME[role]);
  }

  return (
    <Container className="flex justify-center py-14">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 ring-1 ring-niki-edge">
        <div className="flex items-center gap-2">
          <BrandLogo className="h-8 w-auto text-niki-orange" />
          <span className="font-display text-xl font-bold text-niki-ink">
            Niki<span className="text-niki-orange">Mart</span> Data
          </span>
        </div>
        <h1 className="mt-6 font-display text-2xl font-bold text-niki-ink">Agent sign in</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          Your agent account, with the same password you already use.
        </p>

        <AgentLoginForm callbackUrl={cb} />

        <p className="mt-6 text-center text-sm text-niki-ink/60">
          Not selling bundles yet?{" "}
          <Link href="/become-an-agent" className="font-semibold text-niki-orange hover:underline">
            Become an agent
          </Link>
        </p>
        <p className="mt-2 text-center text-xs text-niki-ink/45">
          Shopping on the mall instead?{" "}
          <Link href="/login" className="font-medium underline hover:text-niki-orange">
            Sign in there
          </Link>
          .
        </p>
      </div>
    </Container>
  );
}
