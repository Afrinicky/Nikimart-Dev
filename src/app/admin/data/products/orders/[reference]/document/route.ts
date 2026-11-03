import { NextResponse } from "next/server";
import { requireDataAdminAction } from "@/lib/data-bundles/session";
import { getServiceOrder } from "@/lib/data-bundles/service-orders";
import { SERVICE_STATUS_LABELS, isServiceStatus } from "@/lib/data-bundles/service-status";
import {
  buildRegistrationPdf,
  registrationFileName,
  type PdfSection,
} from "@/lib/data-bundles/service-pdf";

export const dynamic = "force-dynamic";

/**
 * The registration document for one order, as a PDF.
 *
 * This is the sheet somebody walks into the Registrar-General's with, and
 * until now it was being typed out by hand from what the customer had already
 * typed into the form — the slowest part of the job and the one place a Ghana
 * Card number loses a digit.
 *
 * It is built from the order's own answers rather than from a template per
 * service, which is what makes it work for every product and every business
 * type at once: a company's directors and a sole proprietor's street name are
 * both just answers, numbered in the order the form asked for them. A service
 * added next year prints correctly on the day it is added.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ reference: string }> },
) {
  await requireDataAdminAction();

  const { reference } = await params;
  const order = await getServiceOrder(reference);
  if (!order) return new NextResponse("Not found", { status: 404 });

  const status = isServiceStatus(order.status) ? order.status : "pending";

  // The applicant's own details first — they are not form answers, they are
  // how the order was placed, and they belong at the top of the sheet.
  const sections: PdfSection[] = [
    {
      heading: "Applicant",
      entries: [
        { label: "Name", value: order.customerName },
        { label: "Phone number", value: order.customerPhone },
        ...(order.customerEmail ? [{ label: "Email", value: order.customerEmail }] : []),
      ],
    },
  ];

  if (order.answers.length > 0) {
    sections.push({ heading: "Particulars", entries: order.answers });
  }

  // Attachments are named rather than embedded: the registrar wants the
  // photographs themselves, which download separately at full quality, and a
  // re-encoded copy inside a PDF would be worth less than the original.
  if (order.documents.length > 0) {
    sections.push({
      heading: "Attached",
      entries: order.documents.map((d) => ({
        label: d.label,
        value: `attached (${d.fileName})`,
      })),
    });
  }

  const pdf = buildRegistrationPdf({
    title: order.serviceName,
    subtitle: order.variantName,
    meta: [
      `Reference ${order.reference}`,
      `${order.speedLabel || "Standard"}${order.turnaround ? ` — ${order.turnaround}` : ""}`,
      `${SERVICE_STATUS_LABELS[status]} · raised ${order.createdAt.toLocaleDateString("en-GH", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })}`,
    ],
    sections,
    footnotes: [
      order.documents.length > 0
        ? "Please kindly find attached the images listed above."
        : "No documents have been attached to this application yet.",
      "Prepared by Nickimart. Figures and particulars are as submitted by the applicant.",
    ],
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${registrationFileName(
        order.reference,
        order.customerName,
      )}"`,
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
