import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, Lock, ShoppingBag } from "lucide-react";
import { ConsolePill, formatWhen } from "@/components/affiliate/ConsoleTable";
import { StatCard } from "@/components/dashboard/StatCard";
import { ContactCustomerForm } from "@/components/affiliate/ContactCustomerForm";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getAssistCustomer } from "@/lib/affiliate-assist";
import { formatMoney, formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Customer — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One person, as the affiliate who introduced them to Nickimart sees them.
 *
 * Everything on this page is about helping them buy and helping them after
 * they have: what they bought, where it got to, what they looked at, what was
 * said. What is deliberately not here is their phone number, their email and
 * their address — an affiliate reaches them through Nickimart, which is both
 * the record of what was promised and the reason the buyer's details stay the
 * buyer's.
 */
export default async function AffiliateCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { affiliate } = await requireAffiliateConsole();
  const { id } = await params;

  const person = await getAssistCustomer(affiliate.id, id);
  if (!person) notFound();

  const openThread = person.threads.find((t) => t.status !== "resolved") ?? person.threads[0];

  return (
    <div>
      <Link
        href="/affiliate/customers"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/55 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        All customers
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-figures text-2xl font-bold text-niki-ink">{person.name}</h1>
          <p className="mt-1 text-sm text-niki-ink/55">
            {person.kind === "buyer" ? "Bought through your links" : "Clicked your links"} · first
            seen {formatWhen(person.firstSeenAt)}
          </p>
        </div>
        <ContactCustomerForm
          customerId={person.userId}
          customerName={person.name}
          label={openThread ? `Write to ${person.name}` : `Say hello to ${person.name}`}
          suspended={affiliate.status !== "active"}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders" value={person.orders.length} />
        <StatCard label="They have spent" value={formatPrice(person.spend)} />
        <StatCard label="You have earned" value={formatMoney(person.commission)} href="/affiliate/commissions" />
        <StatCard label="Conversations" value={person.threads.length} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5">
          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-niki-ink">
              <ShoppingBag className="h-4 w-4 text-niki-orange" />
              Their orders through you
            </h2>
            {person.orders.length === 0 ? (
              <p className="mt-3 text-sm text-niki-ink/55">
                Nothing bought yet. They clicked — a nudge about what they were looking at is the
                single most useful thing you can send.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-niki-edge">
                {person.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Link
                      href={`/affiliate/orders/${o.id}`}
                      className="font-mono text-xs font-semibold text-niki-orange hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <span className="text-xs text-niki-ink/45">{formatWhen(o.createdAt)}</span>
                    <ConsolePill status={o.status} label={o.stageLabel} />
                    <span className="ml-auto flex items-center gap-3 text-sm">
                      <span className="text-niki-ink/60">{o.items} items</span>
                      <span className="font-semibold text-niki-ink">{formatPrice(o.subtotal)}</span>
                      <span className="font-figures font-bold text-niki-success">
                        +{formatMoney(o.commission)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
            <h2 className="font-display text-lg font-bold text-niki-ink">What was said</h2>
            {person.threads.length === 0 ? (
              <p className="mt-3 text-sm text-niki-ink/55">
                Nothing yet. Every conversation you have with them is kept here, which is also what
                protects you if a promise is ever disputed.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-niki-edge">
                {person.threads.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Link
                      href={`/affiliate/messages/${t.id}`}
                      className={`hover:text-niki-orange ${t.unread ? "font-bold text-niki-ink" : "font-semibold text-niki-ink/80"}`}
                    >
                      {t.subject || t.topicLabel}
                    </Link>
                    <ConsolePill status={t.status} label={t.statusLabel} />
                    <span className="ml-auto text-xs text-niki-ink/45">
                      {t.messageCount} message{t.messageCount === 1 ? "" : "s"} ·{" "}
                      {formatWhen(t.lastMessageAt ?? t.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-niki-ink">
              <Eye className="h-4 w-4 text-niki-orange" />
              What they looked at
            </h2>
            {person.interests.length === 0 ? (
              <p className="mt-2 text-xs text-niki-ink/50">No clicks recorded.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {person.interests.map((i, n) => (
                  <li key={`${i.name}-${n}`} className="text-sm">
                    {i.slug ? (
                      <Link
                        href={`/affiliate/shop/${i.slug}`}
                        className="font-medium text-niki-ink hover:text-niki-orange"
                      >
                        {i.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-niki-ink/70">{i.name}</span>
                    )}
                    <span className="block text-[11px] text-niki-ink/40">{formatWhen(i.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl bg-niki-surface p-4 ring-1 ring-niki-edge">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-niki-ink">
              <Lock className="h-4 w-4 text-niki-ink/50" />
              What you can&apos;t see
            </h2>
            <p className="mt-1.5 text-xs text-niki-ink/55">
              Their phone number, email, delivery address and anything about how they paid stay with
              Nickimart. You can reach them here, and that conversation is the record.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
