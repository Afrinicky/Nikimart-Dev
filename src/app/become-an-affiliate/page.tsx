import type { Metadata } from "next";
import { AffiliateRegistration } from "./AffiliateRegistration";
import { resolveAffiliateInvite } from "@/lib/affiliate-invites";
import { joinChannel } from "@/lib/start-selling";

export const metadata: Metadata = {
  title: "Become an affiliate — Nickimart",
  description:
    "Share Nickimart products and earn commission on every sale you refer. No shop and no stock needed.",
};

export const dynamic = "force-dynamic";

export default async function BecomeAnAffiliatePage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; invite?: string; paid?: string; via?: string }>;
}) {
  const params = await searchParams;

  return (
    <AffiliateRegistration
      referralCode={(params?.ref ?? "").trim().toUpperCase().slice(0, 20)}
      inviteLookup={params?.invite ? await resolveAffiliateInvite(params.invite) : null}
      paid={(params?.paid ?? "").trim()}
      channel={joinChannel(params?.via)}
    />
  );
}
