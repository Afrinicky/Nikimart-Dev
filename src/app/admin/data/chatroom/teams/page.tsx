import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Network, Users } from "lucide-react";
import { ActionLink } from "@/components/ui/motion";
import { ChatroomShell } from "@/components/admin/ChatroomShell";
import { RequestToJoin } from "@/components/chat/RequestToJoin";
import { dataDb } from "@/lib/data-db";
import { listSupportConversations } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";
import { formatWhen } from "@/components/agent/AgentUi";

export const metadata: Metadata = { title: "Team chatrooms — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The teams with a room of their own.
 *
 * An admin can see that a team is talking and ask to be let in; they cannot
 * simply walk in. A leader's room is where they coach people, and an admin
 * reading it unannounced changes what gets said there.
 */
export default async function AdminTeamChatroomsPage() {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") redirect("/admin");

  const [rooms, support] = await Promise.all([
    dataDb.dataConversation
      .findMany({
        where: { kind: "TEAM" },
        orderBy: { lastMessageAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          teamLeaderId: true,
          lastMessageAt: true,
          _count: { select: { members: true } },
          members: { where: { participant: viewer.key }, select: { id: true } },
          requests: {
            where: { participant: viewer.key, status: "pending" },
            select: { id: true },
          },
        },
      })
      .catch(() => []),
    listSupportConversations(viewer.who),
  ]);
  const unread = support.reduce((sum, r) => sum + (r.status === "open" ? r.unread : 0), 0);

  return (
    <ChatroomShell unread={unread}>
      {rooms.length === 0 ? (
        <div className="rounded-2xl bg-white px-4 py-14 text-center ring-1 ring-niki-edge">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/30">
            <Network className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display font-bold text-niki-ink">No team rooms yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/55">
            A room appears here once a leader opens one for their team.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rooms.map((r) => {
            const joined = r.members.length > 0;
            const asked = r.requests.length > 0;
            return (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-niki-orange/12 text-niki-orange">
                  <Users className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-niki-ink">{r.title || "Team"}</p>
                  <p className="truncate text-xs text-niki-ink/45">
                    {r._count.members} {r._count.members === 1 ? "member" : "members"}
                    {r.lastMessageAt ? ` · active ${formatWhen(r.lastMessageAt)}` : " · quiet"}
                  </p>
                </div>

                {joined ? (
                  <ActionLink
                    href={`/admin/data/chatroom/${r.id}`}
                    className="niki-focus shrink-0 rounded-xl bg-niki-black px-4 py-2 text-xs font-bold text-white"
                  >
                    Open
                  </ActionLink>
                ) : asked ? (
                  <span className="shrink-0 rounded-xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                    Waiting on the leader
                  </span>
                ) : (
                  <RequestToJoin conversationId={r.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ChatroomShell>
  );
}
