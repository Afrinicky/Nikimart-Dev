import { NextResponse } from "next/server";
import { requireDataAdminAction } from "@/lib/data-bundles/session";
import { getServiceDocument } from "@/lib/data-bundles/service-orders";

export const dynamic = "force-dynamic";

/**
 * Download one document a customer attached.
 *
 * A route rather than a link to the stored data URL: the files are megabytes,
 * and putting them in the page would mean every list that mentions a document
 * also ships it. This way the queue stays text and the bytes are fetched only
 * when somebody actually asks for one.
 *
 * Admin only, and deliberately not guessable by order — the id is a cuid.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireDataAdminAction();

  const { id } = await params;
  const doc = await getServiceDocument(id);
  if (!doc) return new NextResponse("Not found", { status: 404 });

  // Stored as a data URL; split off the base64 payload and serve the bytes.
  const comma = doc.dataUrl.indexOf(",");
  if (comma < 0) return new NextResponse("Unreadable", { status: 422 });
  const header = doc.dataUrl.slice(5, comma);
  const type = doc.mimeType || header.split(";")[0] || "application/octet-stream";

  let bytes: Buffer;
  try {
    bytes = Buffer.from(doc.dataUrl.slice(comma + 1), "base64");
  } catch {
    return new NextResponse("Unreadable", { status: 422 });
  }

  // The order's reference in the filename, so a folder of downloads can still
  // be told apart once they are out of the console.
  const name = `${doc.order?.reference ?? "document"}-${doc.fileName}`.replace(/[^\w.\-]+/g, "_");

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}
