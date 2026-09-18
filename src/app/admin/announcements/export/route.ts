import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { listRetailAnnouncements } from "@/lib/retail-announcements";
import {
  announcementStatus,
  ANNOUNCEMENT_STATUS_LABELS,
  audienceLabel,
  TONE_LABELS,
} from "@/lib/announcement-rules";
import { workbookResponse, type Sheet } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Every announcement the filters matched, with its status worked out. */
export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = new URL(req.url).searchParams;
  try {
    const { rows } = await listRetailAnnouncements({
      status: sp.get("status") ?? "all",
      audience: sp.get("audience") ?? "all",
      query: sp.get("q") ?? "",
      page: 1,
      perPage: 5000,
    });

    const sheet: Sheet = {
      name: "Announcements",
      columns: [
        "Title",
        "Message",
        "Audience",
        "Tone",
        "Status",
        "Pinned",
        "Starts",
        "Ends",
        "Written",
        "By",
      ],
      rows: rows.map((n) => [
        n.title,
        n.body,
        audienceLabel("retail", n.audience),
        TONE_LABELS[n.tone] ?? n.tone,
        ANNOUNCEMENT_STATUS_LABELS[announcementStatus(n)],
        n.isPinned ? "Yes" : "No",
        n.publishAt ?? "",
        n.expiresAt ?? "",
        n.createdAt,
        n.createdBy,
      ]),
    };

    return workbookResponse([sheet], "announcements");
  } catch (error) {
    console.error("[retail announcements export] failed", error);
    return NextResponse.json({ error: "Could not build the export." }, { status: 500 });
  }
}
