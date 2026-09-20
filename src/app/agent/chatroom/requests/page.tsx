import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DoorOpen } from "lucide-react";
import { AgentChatroomShell } from "@/components/agent/AgentChatroomShell";
import { formatWhen } from "@/components/agent/AgentUi";
import { requireUser } from "@/lib/session";
import { getAgentForUser } from "@/lib/data-bundles/agents";
import { getPendingRequests } from "@/lib/chat/conversations";
import { decideRequest } from "@/lib/chat/actions";
import { currentViewer } from "@/lib/chat/viewer";

export const metadata: Metadata = { title: "Join requests — Agent — Nickimart" };
export const dynamic = "force-dynamic";

/** Who is waiting to be let into a room this agent runs. */
export default async function AgentRequestsPage() {
  const user = await requireUser();
  if (!(await getAgentForUser(user.id))) redirect("/become-an-agent");
  const viewer = await currentViewer();
  if (!viewer) redirect("/agent");

  const requests = await getPendingRequests(viewer.who);

  return (
    <AgentChatroomShell active="/agent/chatroom/requests" requests={requests.length}>
      {requests.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-14 text-center ring-1 ring-niki-edge">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/30">
            <DoorOpen className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display font-bold text-niki-ink">Nobody is waiting</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">
            Requests to join your rooms show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-niki-edge"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-niki-ink">
                  {r.displayName}
                  <span className="ml-2 font-normal text-niki-ink/50">
                    wants into {r.conversationTitle}
                  </span>
                </p>
                {r.message ? (
                  <p className="mt-0.5 truncate text-xs text-niki-ink/60">&ldquo;{r.message}&rdquo;</p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-niki-ink/40">{formatWhen(r.createdAt)}</p>
              </div>

              <div className="flex shrink-0 gap-2">
                <form action={decideRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="decline" />
                  <button
                    type="submit"
                    className="niki-press niki-focus rounded-xl bg-white px-3.5 py-2 text-xs font-bold text-niki-ink/60 ring-1 ring-niki-edge hover:bg-niki-black/5"
                  >
                    Decline
                  </button>
                </form>
                <form action={decideRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <button
                    type="submit"
                    className="niki-press niki-focus rounded-xl bg-niki-success px-4 py-2 text-xs font-bold text-white"
                  >
                    Let them in
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AgentChatroomShell>
  );
}
