import type { Metadata } from "next";
import { AgentRegistration } from "./AgentRegistration";
import { resolveAgentInvite } from "@/lib/data-bundles/invites";

export const metadata: Metadata = {
  title: "Become a Data Agent — Nickimart",
  description:
    "Open your own data bundle storefront under Nickimart. Set your own prices, sell to your customers, and earn on every bundle.",
};

export const dynamic = "force-dynamic";

export default async function BecomeAnAgentPage({
  searchParams,
}: {
  searchParams?: Promise<{ ref?: string; invite?: string }>;
}) {
  const params = await searchParams;

  return (
    <AgentRegistration
      referralCode={(params?.ref ?? "").trim().toUpperCase().slice(0, 20)}
      inviteLookup={params?.invite ? await resolveAgentInvite(params.invite) : null}
    />
  );
}
