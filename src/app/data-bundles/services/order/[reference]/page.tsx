import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, Clock3, MessageCircle, Search } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ServiceDocuments, type DocumentSlot } from "@/components/data/ServiceDocuments";
import { getServiceOrder } from "@/lib/data-bundles/service-orders";
import {
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_NOTE,
  SERVICE_STATUS_TONES,
  isServiceStatus,
} from "@/lib/data-bundles/service-status";
import { getServiceById, formFor } from "@/lib/data-bundles/services";
import { getDataStoreConfig, getServicesConfig } from "@/lib/data-bundles/settings";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = { title: "Your application — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * One application, after payment.
 *
 * Two jobs. It says where the work has got to, and it is the only place a
 * customer's documents are ever uploaded — which is why it exists at all. The
 * form on the way in asks for text; the files come here, against a reference
 * that has cleared, because payment is the confirmation of the application.
 *
 * Reached by reference, like every other order lookup on this store. There is
 * no account to sign into and the reference is the customer's own key; what it
 * opens is their own order and nothing else.
 */
export default async function ServiceOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ reference: string }>;
  searchParams?: Promise<{ paid?: string; failed?: string }>;
}) {
  const [{ reference }, query, config, store] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ paid?: string; failed?: string }>({}),
    getServicesConfig(),
    getDataStoreConfig(),
  ]);

  const order = await getServiceOrder(reference);
  if (!order) notFound();

  const status = isServiceStatus(order.status) ? order.status : "pending";
  const paid = order.paymentStatus === "paid";

  // What this order was asked to attach, and what has arrived. Read from the
  // service as it stands: a question added since is a question still worth
  // asking, and one removed is one nobody should be chased for.
  let slots: DocumentSlot[] = [];
  if (order.serviceId) {
    const service = await getServiceById(order.serviceId);
    const variant = service?.variants.find((v) => v.id === order.variantId);
    if (service) {
      slots = formFor(service, variant ?? { fields: [] })
        .filter((f) => f.type === "file")
        .map((f) => ({
          key: f.key,
          label: f.label,
          required: f.required,
          hint: f.hint,
          fileName: order.documents.find((d) => d.fieldKey === f.key)?.fileName ?? null,
        }));
    }
  }

  return (
    <>
      <PageHeader
        title={order.serviceName}
        subtitle={`${order.variantName}${order.speedLabel ? ` · ${order.speedLabel}` : ""}`}
        crumbs={[
          { label: "Data bundles", href: "/data-bundles" },
          { label: "Application" },
        ]}
        tone="dark"
      >
        <Link
          href={`/data-bundles/orders?q=${encodeURIComponent(order.reference)}`}
          className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 transition-colors hover:bg-white/20"
        >
          <Search className="h-4 w-4" />
          Track order
        </Link>
      </PageHeader>

      <Container className="py-8">
        <div className="mx-auto max-w-2xl space-y-5">
          {query.paid ? (
            <p className="animate-fade-up rounded-xl bg-niki-success/10 px-4 py-3 text-sm font-medium text-niki-success ring-1 ring-niki-success/30">
              Payment received. Attach your documents below and we&apos;ll get started.
            </p>
          ) : null}
          {query.failed ? (
            <p className="animate-fade-up rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 ring-1 ring-amber-200">
              We couldn&apos;t confirm that payment yet. If it left your wallet, it settles as soon
              as the gateway confirms it.
            </p>
          ) : null}

          {/* Where it has got to */}
          <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
            <div className="flex flex-wrap items-start justify-between gap-3 p-5">
              <div>
                <p className="font-display text-lg font-bold text-niki-ink">
                  {order.serviceName}
                </p>
                <p className="mt-0.5 text-sm text-niki-ink/60">{order.variantName}</p>
              </div>
              <span
                className={`inline-flex rounded-full px-4 py-2 text-sm font-bold ${SERVICE_STATUS_TONES[status]}`}
              >
                {SERVICE_STATUS_LABELS[status]}
              </span>
            </div>

            <p className="border-t border-niki-edge px-5 py-4 text-sm leading-relaxed text-niki-ink/70">
              {order.adminNote || SERVICE_STATUS_NOTE[status]}
            </p>

            <dl className="grid grid-cols-2 gap-4 border-t border-niki-edge bg-niki-surface/60 p-5 sm:grid-cols-3">
              <div>
                <dt className="text-xs font-medium text-niki-ink/45">Amount</dt>
                <dd className="mt-0.5 font-figures font-bold text-niki-ink">
                  {formatPrice(order.price)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-niki-ink/45">Turnaround</dt>
                <dd className="mt-0.5 flex items-center gap-1 text-sm font-semibold text-niki-ink">
                  <Clock3 className="h-3.5 w-3.5 text-niki-ink/35" />
                  {order.turnaround || "On request"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-niki-ink/45">Reference</dt>
                <dd className="mt-0.5 font-mono text-xs font-semibold text-niki-ink">
                  {order.reference}
                </dd>
              </div>
            </dl>
          </div>

          {/* Documents, once it has been paid for */}
          {slots.length > 0 ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              {paid ? (
                <ServiceDocuments
                  reference={order.reference}
                  slots={slots}
                  maxBytes={config.maxUploadBytes}
                />
              ) : (
                <>
                  <p className="font-display font-bold text-niki-ink">Documents</p>
                  <p className="mt-1 text-sm text-niki-ink/60">
                    You&apos;ll be asked for these once payment clears. Nothing is stored before
                    then.
                  </p>
                  <ul className="mt-3 list-inside list-disc text-sm text-niki-ink/65">
                    {slots.map((s) => (
                      <li key={s.key}>{s.label}</li>
                    ))}
                  </ul>
                  <Link
                    href={`/data-bundles/services/pay/${encodeURIComponent(order.reference)}`}
                    className="niki-press mt-4 inline-flex rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
                  >
                    Pay {formatPrice(order.price)}
                  </Link>
                </>
              )}
            </div>
          ) : !paid ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="font-display font-bold text-niki-ink">Not paid yet</p>
              <p className="mt-1 text-sm text-niki-ink/60">
                Nothing starts until the fee clears.
              </p>
              <Link
                href={`/data-bundles/services/pay/${encodeURIComponent(order.reference)}`}
                className="niki-press mt-4 inline-flex rounded-full bg-niki-orange px-5 py-2.5 text-sm font-bold text-white hover:bg-niki-orange-light"
              >
                Pay {formatPrice(order.price)}
              </Link>
            </div>
          ) : null}

          {/* How to get back here.
              Documents are the step people stop on: the card is on another
              phone, the photograph is with somebody else. Saying plainly how
              to return is the difference between finishing tomorrow and
              ringing support. */}
          {paid ? (
            <div className="rounded-2xl bg-niki-trust/[0.06] p-5 ring-1 ring-niki-trust/25">
              <p className="flex items-center gap-1.5 font-display font-bold text-niki-ink">
                <Bookmark className="h-4 w-4 text-niki-trust" />
                Come back any time
              </p>
              <p className="mt-1 text-sm text-niki-ink/70">
                Nothing is lost if you stop here. Your place is kept against this reference —
                open{" "}
                <Link
                  href="/data-bundles/services/resume"
                  className="font-semibold text-niki-orange hover:underline"
                >
                  Continue your application
                </Link>{" "}
                and give the reference below, or the phone number or email you paid with.
              </p>
              <code className="mt-3 inline-block rounded-xl bg-white px-4 py-2 font-mono text-sm font-bold tracking-wide text-niki-ink ring-1 ring-niki-edge">
                {order.reference}
              </code>
            </div>
          ) : null}

          {/* What they told us */}
          {order.answers.length > 0 ? (
            <div className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="mb-3 font-display font-bold text-niki-ink">Your details</p>
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {order.answers.map((a) => (
                  <div key={a.key}>
                    <dt className="text-xs font-medium text-niki-ink/45">{a.label}</dt>
                    <dd className="mt-0.5 break-words text-sm font-medium text-niki-ink">
                      {a.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 text-xs text-niki-ink/45">
                Something wrong? Message us with your reference and we&apos;ll correct it.
              </p>
            </div>
          ) : null}

          {store.whatsapp ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <p className="text-sm text-niki-ink/60">
                Need to tell us something about this application?
              </p>
              <a
                href={store.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="flex shrink-0 items-center gap-1.5 rounded-full bg-niki-ghana px-5 py-2.5 text-sm font-semibold text-white"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp Nickimart
              </a>
            </div>
          ) : null}
        </div>
      </Container>
    </>
  );
}
