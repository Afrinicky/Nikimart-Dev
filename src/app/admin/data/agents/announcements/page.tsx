import { redirect } from "next/navigation";

/**
 * Announcements moved out of Agent management into a module of its own. Kept
 * as a redirect because this path is in browser histories and bookmarks, and a
 * 404 is a worse answer than the page somebody wanted.
 */
export default function MovedPage() {
  redirect("/admin/data/announcements");
}
