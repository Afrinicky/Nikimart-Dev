import "server-only";
import { broadcastAudiences } from "@/lib/broadcasts";
import {
  listContacts,
  listTags,
  listThreadMessages,
  listThreads,
  messengerStats,
  type MessageScope,
} from "@/lib/messenger";

/**
 * Everything a Messenger screen needs, gathered once.
 *
 * Both consoles render the same components from the same shapes, so the
 * reads, the serialising of dates for the client, and the audience list all
 * belong in one place rather than being written twice and drifting.
 */
export async function loadChats(scope: MessageScope, activeId: string | undefined) {
  const [threads, tags, stats] = await Promise.all([
    listThreads(scope),
    listTags(scope),
    messengerStats(scope),
  ]);

  const active = activeId ? threads.find((t) => t.contact.id === activeId)?.contact ?? null : null;
  const messages = active ? await listThreadMessages(scope, active.id) : [];

  return {
    stats,
    groups: tags,
    audiences: broadcastAudiences(scope),
    threads: threads.map((t) => ({
      contact: {
        id: t.contact.id,
        name: t.contact.name,
        phone: t.contact.phone,
        email: t.contact.email,
        tags: t.contact.tags,
      },
      lastBody: t.lastMessage?.body ?? "",
      lastAt: t.lastMessage?.createdAt.toISOString() ?? null,
      count: t.messageCount,
    })),
    contacts: threads.map((t) => ({
      id: t.contact.id,
      name: t.contact.name,
      phone: t.contact.phone,
      email: t.contact.email,
    })),
    active: active
      ? {
          id: active.id,
          name: active.name,
          phone: active.phone,
          email: active.email,
          tags: active.tags,
        }
      : null,
    messages: messages.map((m) => ({
      id: m.id,
      channel: m.channel,
      subject: m.subject,
      body: m.body,
      status: m.status,
      sentBy: m.sentBy,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function loadContacts(
  scope: MessageScope,
  filter: { query: string; tag: string; archived: boolean },
) {
  const [{ contacts, total }, tags] = await Promise.all([
    listContacts(scope, {
      query: filter.query,
      tag: filter.tag,
      archived: filter.archived,
      perPage: 200,
    }),
    listTags(scope),
  ]);

  return {
    total,
    groups: tags,
    audiences: broadcastAudiences(scope),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      tags: c.tags,
      note: c.note,
      source: c.source,
      archived: c.archived,
      lastMessageAt: c.lastMessageAt?.toISOString() ?? null,
    })),
  };
}
