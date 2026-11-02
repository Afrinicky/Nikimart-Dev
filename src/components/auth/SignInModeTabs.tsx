"use client";

import Link from "next/link";
import { useState } from "react";
import { Signal, Store } from "lucide-react";
import { cn } from "@/lib/cn";
import { LoginForm } from "@/components/auth/LoginForm";
import { AgentLoginForm } from "@/components/agent/AgentLoginForm";

/**
 * One door, two businesses.
 *
 * Most people arrive at the mall's homepage and press "Sign in", including
 * agents — who were then looking at a form that checks the mall's accounts and
 * cannot sign them in at all, with no sign that a different door existed. A
 * switch is kinder than a second link they would have to be told about.
 *
 * Administrators are not a third tab, deliberately. They hold accounts in both
 * businesses and use whichever side they are going to; naming them here would
 * advertise that an admin console exists and exactly where to knock, which is
 * free information for somebody probing and no help to the one person who
 * already knows.
 *
 * The forms are unchanged and keep their own actions, so each half still signs
 * in against its own database. This only chooses which one is on screen.
 */
export function SignInModeTabs({
  callbackUrl,
  registerHref,
}: {
  callbackUrl?: string;
  /** Where "create an account" goes for the mall, callback already attached. */
  registerHref: string;
}) {
  // The mall first: it is the common case, and an agent switching once is a
  // smaller cost than a shopper landing on a form that is not for them.
  const [mode, setMode] = useState<"shop" | "agent">("shop");
  // Set when somebody has just been moved here from the shop tab, so the
  // reason is on screen rather than them wondering why the form changed.
  const [sentOver, setSentOver] = useState(false);

  const tab = (value: "shop" | "agent", label: string, Icon: typeof Store) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => {
        setMode(value);
        setSentOver(false);
      }}
      className={cn(
        "niki-focus flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
        mode === value
          ? "bg-white text-niki-ink shadow-sm ring-1 ring-niki-edge"
          : "text-niki-ink/55 hover:text-niki-ink",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );

  return (
    <div>
      <div role="tablist" aria-label="What are you signing in to?" className="flex gap-1 rounded-2xl bg-niki-surface p-1">
        {tab("shop", "Shop", Store)}
        {tab("agent", "Data agent", Signal)}
      </div>

      {mode === "shop" ? (
        <>
          <p className="mt-4 text-sm text-niki-ink/60">Sign in to your Nickimart account.</p>
          <LoginForm
            callbackUrl={callbackUrl}
            onAgentAccount={() => {
              setMode("agent");
              setSentOver(true);
            }}
          />
        </>
      ) : (
        <>
          {sentOver ? (
            <p className="animate-fade-up mt-4 rounded-xl bg-niki-orange/10 px-4 py-3 text-sm font-medium text-niki-ink ring-1 ring-niki-orange/25">
              That&apos;s a data agent account — you&apos;re in the right place now. Enter your
              password again to sign in.
            </p>
          ) : (
            <p className="mt-4 text-sm text-niki-ink/60">
              Sign in to your data agent console, with the password you already use.
            </p>
          )}
          {/* The agent form posts to the bundle sign-in, so a callback into the
              mall would be meaningless — it is deliberately not passed on. */}
          <AgentLoginForm />
        </>
      )}

      {/* The footer follows the switch. A "Forgot your password?" that always
          pointed at the mall's reset would send an agent to set a password on
          an account that is not the one they cannot get into. */}
      <p className="mt-4 text-center text-sm">
        <Link
          href={mode === "agent" ? "/agent-forgot-password" : "/forgot-password"}
          className="font-semibold text-niki-orange hover:underline"
        >
          Forgot your password?
        </Link>
      </p>

      <p className="mt-6 text-center text-sm text-niki-ink/60">
        {mode === "agent" ? (
          <>
            Not selling bundles yet?{" "}
            <Link href="/become-an-agent" className="font-semibold text-niki-orange hover:underline">
              Become an agent
            </Link>
          </>
        ) : (
          <>
            New to Nickimart?{" "}
            <Link href={registerHref} className="font-semibold text-niki-orange hover:underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
