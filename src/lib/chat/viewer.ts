import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getAffiliateForUser } from "@/lib/affiliate";
import { getAgentUser } from "@/lib/data-bundles/user-link";
import { participantKey, type Participant } from "@/lib/chat/identity";

/**
 * Who is asking, worked out from the session rather than from the request.
 *
 * An agent is an agent, an affiliate is an affiliate, an admin is an admin,
 * and a signed-in person who is several of those is treated as an admin —
 * because somebody holding a storefront and the console is in the console to
 * run the platform. An agent who is also an affiliate is read as an agent:
 * that account is older, and the rooms they are already in are keyed to it.
 */

export interface Viewer {
  who: Participant;
  key: string;
  name: string;
}

export async function currentViewer(): Promise<Viewer | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user
    .findUnique({ where: { id: userId }, select: { name: true, email: true, role: true } })
    .catch(() => null);

  if (user && user.role !== "CUSTOMER") {
    const who: Participant = { kind: "ADMIN", id: userId };
    return {
      who,
      key: participantKey("ADMIN", userId),
      name: user.name ?? user.email ?? "Nickimart",
    };
  }

  const agent = await getAgentForUser(userId);
  if (agent) {
    const owner = await getAgentUser(agent.userId);
    const who: Participant = { kind: "AGENT", id: agent.id };
    return {
      who,
      key: participantKey("AGENT", agent.id),
      name: owner?.name || agent.storeName,
    };
  }

  const affiliate = await getAffiliateForUser(userId);
  if (affiliate) {
    const who: Participant = { kind: "AFFILIATE", id: affiliate.id };
    return {
      who,
      key: participantKey("AFFILIATE", affiliate.id),
      name: user?.name || affiliate.name,
    };
  }

  return null;
}
