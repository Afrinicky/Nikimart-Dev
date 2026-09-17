import { redirect } from "next/navigation";

/**
 * Moved into the Agent management module. Kept as a redirect because these
 * paths are in browser histories and bookmarks, and a 404 is a worse answer
 * than the page somebody wanted.
 */
export default function MovedPage() {
  redirect("/admin/data/agents/announcements");
}
