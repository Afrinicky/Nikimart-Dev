"use client";

import { CopyChip } from "@/components/agent/AgentCode";

/**
 * The agent's referral code and the link that carries it.
 *
 * Both, because agents share them differently: the code goes into a WhatsApp
 * message or is read down a phone, and the link is what gets forwarded. They
 * are the same thing — the link just fills the code in on the signup form — so
 * the code is shown first and the link sits under it as the convenience.
 */
export function ReferralShare({ code, link }: { code: string; link: string }) {
  return (
    <div className="rounded-2xl bg-niki-black p-5 text-white">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
        Your referral code
      </p>
      <p className="mt-1.5 font-figures text-3xl font-bold tracking-wide">{code}</p>
      <p className="mt-2 text-sm text-white/60">
        It&apos;s your agent code — the same one on your dashboard. Anyone who quotes it when they
        apply is recorded as yours for good.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <CopyChip
          label="Copy code"
          value={code}
          hideValue
          className="bg-niki-orange text-white hover:bg-niki-orange-light"
        />
        <CopyChip
          label="Copy invite link"
          value={link}
          hideValue
          className="bg-white/10 text-white ring-1 ring-white/15 hover:bg-white/20"
        />
      </div>

      <p className="mt-3 break-all font-mono text-[11px] text-white/40">{link}</p>
    </div>
  );
}
