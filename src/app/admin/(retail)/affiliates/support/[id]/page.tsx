import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, User } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ConsolePill, formatWhen } from "@/components/affiliate/ConsoleTable";
import { MessageThread } from "@/components/affiliate/MessageThread";
import { inputClass } from "@/components/ui/Field";
import { requireDashboard } from "@/lib/session";
import { getEnquiry } from "@/lib/affiliate-assist";
import { closeEnquiry, markThreadRead, setEnquiryPriority } from "@/lib/affiliate-assist-actions";

export const metadata: Metadata = { title: "Affiliate enquiry — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One enquiry, answered.
 *
 * What is written here is what the affiliate will pass to their customer with
 * Nickimart's name attached, so the box is the one place on the platform where
 * "we are checking" is a better answer than a guess. A private note is
 * available for the working-out.
 */
export default async function AdminAffiliateEnquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireDashboard("/admin");
  const { id } = await params;

  const enquiry = await getEnquiry(id);
  if (!enquiry) notFound();
  await markThreadRead(id);

  return (
    <Container className="max-w-5xl py-8">
      <Link
        href="/admin/affiliates/support"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to the queue
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-niki-ink">
            {enquiry.subject || "An enquiry"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-niki-ink/55">
            <Link
              href={`/admin/affiliates/${enquiry.affiliateId}`}
              className="font-semibold text-niki-ink/75 hover:text-niki-orange"
            >
              {enquiry.affiliateName}
            </Link>
            <span className="font-mono text-xs text-niki-ink/40">{enquiry.affiliateCode}</span>
            <span>·</span>
            <span>{enquiry.topicLabel}</span>
            <span>·</span>
            <span>raised {formatWhen(enquiry.createdAt)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ConsolePill status={enquiry.priority} label={enquiry.priority} />
          <ConsolePill status={enquiry.status} label={enquiry.statusLabel} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_17rem]">
        <MessageThread
          threadId={enquiry.id}
          kind="support"
          role="support"
          messages={enquiry.messages.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          }))}
          allowInternal
          allowResolve={false}
          resolved={enquiry.status === "resolved"}
          resolution={enquiry.resolution}
          placeholder="Answer plainly. The affiliate can pass this to their customer as confirmed by Nickimart, so say what we know — and say so when we are still checking."
        />

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
            <h2 className="font-display text-sm font-bold text-niki-ink">What it is about</h2>
            <ul className="mt-2 space-y-2 text-sm">
              {enquiry.customerName ? (
                <li className="flex items-center gap-2 text-niki-ink/70">
                  <User className="h-3.5 w-3.5 text-niki-ink/40" />
                  {enquiry.customerName}
                </li>
              ) : null}
              {enquiry.orderNumber ? (
                <li className="flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-niki-ink/40" />
                  <Link
                    href={`/admin/orders?q=${enquiry.orderNumber}`}
                    className="font-mono text-xs font-semibold text-niki-orange hover:underline"
                  >
                    {enquiry.orderNumber}
                  </Link>
                </li>
              ) : (
                <li className="text-xs text-niki-ink/45">Not about a particular order.</li>
              )}
              {enquiry.escalatedFromId ? (
                <li className="text-xs text-niki-ink/45">
                  Raised from a customer&apos;s own question.
                </li>
              ) : null}
            </ul>
          </div>

          <form
            action={setEnquiryPriority}
            className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-niki-edge"
          >
            <input type="hidden" name="threadId" value={enquiry.id} />
            <label
              htmlFor="priority"
              className="block font-display text-sm font-bold text-niki-ink"
            >
              Priority
            </label>
            <select id="priority" name="priority" defaultValue={enquiry.priority} className={inputClass}>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            <button
              type="submit"
              className="niki-press w-full rounded-xl px-3 py-2 text-sm font-semibold text-niki-ink/70 ring-1 ring-niki-edge-strong hover:bg-niki-surface"
            >
              Update
            </button>
          </form>

          {enquiry.status !== "resolved" ? (
            <form
              action={closeEnquiry}
              className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-niki-edge"
            >
              <input type="hidden" name="threadId" value={enquiry.id} />
              <label
                htmlFor="resolution"
                className="block font-display text-sm font-bold text-niki-ink"
              >
                Close it
              </label>
              <input
                id="resolution"
                name="resolution"
                maxLength={300}
                placeholder="How it ended"
                className={inputClass}
              />
              <button
                type="submit"
                className="niki-press w-full rounded-xl bg-niki-ink px-3 py-2 text-sm font-semibold text-white hover:bg-niki-ink/90"
              >
                Mark resolved
              </button>
              <p className="text-[11px] text-niki-ink/45">
                The affiliate can still write, which reopens it.
              </p>
            </form>
          ) : null}
        </aside>
      </div>
    </Container>
  );
}
