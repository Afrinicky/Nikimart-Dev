import "server-only";
import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * The Chatroom module's tabs.
 *
 * Every kind of room is one place with one list, because the question an admin
 * arrives with is "who is waiting on me" rather than "which sort of room was
 * it". Enquiries come first: they are the only ones with somebody outside the
 * business at the other end.
 */
export function CHATROOM_TABS(unread = 0): ModuleTab[] {
  return [
    { href: "/admin/data/chatroom", label: "Enquiries", icon: "lifebuoy", exact: true, badge: unread },
    { href: "/admin/data/chatroom/rooms", label: "Rooms", icon: "users" },
    { href: "/admin/data/chatroom/teams", label: "Teams", icon: "network" },
    { href: "/admin/data/chatroom/direct", label: "Direct", icon: "message" },
  ];
}

/** The agent's own, which is the same idea with fewer doors. */
export function AGENT_CHATROOM_TABS(): { href: string; label: string }[] {
  return [
    { href: "/agent/chatroom", label: "Rooms" },
    { href: "/agent/chatroom/direct", label: "Direct" },
    { href: "/agent/chatroom/requests", label: "Requests" },
  ];
}
