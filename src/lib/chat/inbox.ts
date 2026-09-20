import "server-only";
import { dataDb } from "@/lib/data-db";
import { listSupportConversations } from "@/lib/chat/conversations";
import { currentViewer } from "@/lib/chat/viewer";

/**
 * What the admin's chat dock needs to know.
 *
 * A short read run on every console page, so it asks for the few open
 * enquiries and nothing else — the full inbox is a screen of its own.
 */

export interface DockEnquiry {
  id: string;
  title: string;
  visitorName: string;
  visitorPhone: string;
  preview: string;
  unread: number;
  lastMessageAt: string | null;
}

export async function getDockEnquiries(take = 8): Promise<DockEnquiry[]> {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") return [];

  try {
    const rows = await listSupportConversations(viewer.who, take);
    return rows
      .filter((r) => r.status === "open")
      .map((r) => ({
        id: r.id,
        title: r.title,
        visitorName: r.visitorName,
        visitorPhone: r.visitorPhone,
        preview: r.preview,
        unread: r.unread,
        lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
      }));
  } catch {
    return [];
  }
}

/** Make sure the admin is on the enquiry's member list before they reply. */
export async function joinEnquiry(conversationId: string): Promise<void> {
  const viewer = await currentViewer();
  if (viewer?.who.kind !== "ADMIN") return;
  try {
    await dataDb.dataConversationMember.upsert({
      where: { conversationId_participant: { conversationId, participant: viewer.key } },
      create: { conversationId, participant: viewer.key, displayName: viewer.name },
      update: { lastReadAt: new Date() },
    });
  } catch {
    // Gone, or not migrated.
  }
}
