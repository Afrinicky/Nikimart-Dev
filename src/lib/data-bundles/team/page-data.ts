import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { resolveWindow, dayKey, type OverviewWindow } from "@/lib/data-bundles/overview-window";
import type { AgentAccount } from "@/lib/data-bundles/agents";

/**
 * What every team tab needs before it can draw anything: the agent, and the
 * window they are looking through.
 *
 * Shared because five screens asking the same two questions in five slightly
 * different ways is how two of them end up disagreeing about what "today"
 * means.
 */
export interface TeamPageContext {
  agent: AgentAccount;
  period: OverviewWindow;
  /** Which range pill is lit. "today" is a one-day custom range. */
  active: string;
  today: string;
}

export async function teamPageContext(
  searchParams?: Promise<{ days?: string; from?: string; to?: string }>,
): Promise<TeamPageContext> {
  const user = await requireUser();
  const agent = await getAgentForUser(user.id);
  if (!agent) redirect("/become-an-agent");

  const period = resolveWindow(await searchParams);
  const today = dayKey(new Date());
  const active =
    period.key === "custom" && period.from === today && period.to === today ? "today" : period.key;

  return { agent, period, active, today };
}
