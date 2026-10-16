import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Package, ShieldCheck } from "lucide-react";
import { ConsolePill } from "@/components/affiliate/ConsoleTable";
import { MessageThread } from "@/components/affiliate/MessageThread";
import { EscalateForm } from "@/components/affiliate/EscalateForm";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getThread } from "@/lib/affiliate-assist";
import { markThreadRead } from "@/lib/affiliate-assist-actions";

export const metadata: Metadata = { title: "Conversation — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One conversation, with what it is about alongside it.
 *
 * Reading it marks it read on the server rather than from a script, so the
 * badge is right for somebody on a slow phone with JavaScript still loading.
 */
export default async function AffiliateThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const { id } = await params;

  const thread = await getThread(id, { role: "affiliate", affiliateId: affiliate.id });
  if (!thread) notFound();
  await markThreadRead(id);

  const isSupport = thread.kind === "support";

  return (
    <div>
      <Link
        href={isSupport ? "/affiliate/escalations" : "/affiliate/messages"}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        {isSupport ? "All enquiries" : "All messages"}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-figures text-2xl font-bold text-niki-ink">
            {thread.subject || thread.topicLabel}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-niki-ink/55">
            <span className="font-semibold text-niki-ink/75">{thread.who}</span>
            <span>·</span>
            <span>{thread.topicLabel}</span>
            {thread.orderNumber ? (
              <>
                <span>·</span>
                <Link
                  href={thread.orderId ? `/affiliate/orders/${thread.orderId}` : "/affiliate/orders"}
                  className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-niki-orange hover:underline"
                >
                  <Package className="h-3.5 w-3.5" />
                  {thread.orderNumber}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isSupport ? <ConsolePill status={thread.priority} label={thread.priority} /> : null}
          <ConsolePill status={thread.status} label={thread.statusLabel} />
        </div>
      </div>

      {isSupport ? (
        <p className="mt-4 flex items-start gap-2 rounded-xl bg-niki-trust/5 px-4 py-3 text-sm text-niki-ink/70 ring-1 ring-niki-trust/20">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-niki-trust" />
          This is your line to Nickimart. When an answer comes back, use{" "}
          <strong className="font-semibold text-niki-ink">Pass this on</strong> and your customer
          gets it marked as confirmed by Nickimart — not as your own word.
        </p>
      ) : null}

      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_18rem]">
        <MessageThread
          threadId={thread.id}
          kind={thread.kind}
          role="affiliate"
          resolved={thread.status === "resolved"}
          resolution={thread.resolution}
          allowInternal
          allowRelay={isSupport}
          disabled={affiliate.status === "suspended"}
          disabledNote="Your affiliate account is on hold, so you can't send messages. Commission you have already earned is unaffected."
          messages={thread.messages.map((m) => ({
            ...m,
            createdAt: m.createdAt.toISOString(),
          }))}
        />

        <aside className="space-y-4">
          {!isSupport ? (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
              <h2 className="font-display text-sm font-bold text-niki-ink">
                Don&apos;t know the answer?
              </h2>
              <p className="mt-1 mb-3 text-xs text-niki-ink/55">
                Ask Nickimart rather than guessing. A wrong promise costs you the customer.
              </p>
              <EscalateForm
                threadId={thread.id}
                orderId={thread.orderId}
                orderNumber={thread.orderNumber}
                defaultSubject={thread.subject}
                defaultTopic={thread.topic}
              />
            </div>
          ) : null}

          {thread.escalatedFromId ? (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
              <h2 className="font-display text-sm font-bold text-niki-ink">Raised from</h2>
              <Link
                href={`/affiliate/messages/${thread.escalatedFromId}`}
                className="mt-1 block text-sm font-semibold text-niki-orange hover:underline"
              >
                Your customer&apos;s question
              </Link>
            </div>
          ) : null}

          {thread.escalationIds.length > 0 ? (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
              <h2 className="font-display text-sm font-bold text-niki-ink">
                Enquiries from this
              </h2>
              <ul className="mt-2 space-y-1.5">
                {thread.escalationIds.map((eid, i) => (
                  <li key={eid}>
                    <Link
                      href={`/affiliate/messages/${eid}`}
                      className="text-sm font-semibold text-niki-orange hover:underline"
                    >
                      Enquiry {i + 1} with Nickimart
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {thread.customerId ? (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
              <h2 className="font-display text-sm font-bold text-niki-ink">The customer</h2>
              <Link
                href={`/affiliate/customers/${thread.customerId}`}
                className="mt-1 block text-sm font-semibold text-niki-orange hover:underline"
              >
                {thread.who}&apos;s history with you
              </Link>
              <p className="mt-2 text-xs text-niki-ink/45">
                Nickimart keeps their phone number and address. You reach them here, and the
                conversation is the record.
              </p>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
