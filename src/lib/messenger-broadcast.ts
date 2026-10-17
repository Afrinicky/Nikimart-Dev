import "server-only";
import { audienceLabel, listBroadcasts } from "@/lib/broadcasts";
import { listBatches } from "@/lib/messenger";
import type { MessageScope } from "@/lib/message-templates";
import type { HistoryRow } from "@/components/admin/messenger/BroadcastHistory";

/**
 * The sent history, from both places it lives.
 *
 * Broadcasts sent before the Messenger were summarised into their own table,
 * one row per send. Everything since is one row per recipient, grouped back
 * up. Showing them as two lists would make the older ones look like a
 * different kind of event, which they are not — so they are merged and sorted
 * by when they went out, and the reader never has to know there was a change.
 */
export async function broadcastHistory(scope: MessageScope): Promise<HistoryRow[]> {
  const [batches, legacy] = await Promise.all([listBatches(scope), listBroadcasts(scope)]);

  const rows: HistoryRow[] = [
    ...batches.map((b) => ({
      id: b.id,
      audienceLabel: b.audience ? audienceLabel(scope, b.audience) : "Chosen contacts",
      channel: b.channel,
      subject: b.subject,
      body: b.body,
      recipients: b.recipients,
      delivered: b.delivered,
      failed: b.failed,
      sentBy: b.sentBy,
      createdAt: b.createdAt,
    })),
    ...legacy.map((b) => ({
      id: b.id,
      audienceLabel: audienceLabel(scope, b.audience),
      channel: b.channel,
      subject: b.subject,
      body: b.body,
      recipients: b.recipients,
      delivered: b.delivered,
      failed: b.failed,
      sentBy: b.sentBy,
      createdAt: b.createdAt,
    })),
  ];

  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 60);
}
