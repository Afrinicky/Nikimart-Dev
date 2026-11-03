"use client";

import { useState } from "react";
import {
  ChevronDown,
  Download,
  Mail,
  MessageCircle,
  Paperclip,
  Trash2,
} from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import {
  SERVICE_STATUSES,
  SERVICE_STATUS_LABELS,
  SERVICE_STATUS_TONES,
  isServiceStatus,
} from "@/lib/data-bundles/service-status";
import {
  deleteServiceDocument,
  updateServiceOrder,
} from "@/lib/data-bundles/service-admin-actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * One service order, open or closed.
 *
 * Closed it is a line: who, what, how much, where it has got to. Open it is
 * everything needed to actually do the work — the answers they gave, the
 * documents they sent, a way to reach them, and the one control that moves the
 * order on.
 *
 * Collapsed by default because a queue is read before it is worked, and thirty
 * expanded applications is not a queue.
 */

export interface AdminOrderView {
  id: string;
  reference: string;
  serviceName: string;
  variantName: string;
  speedLabel: string;
  turnaround: string;
  price: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  status: string;
  paymentStatus: string;
  adminNote: string;
  source: string;
  agentName: string | null;
  agentCommission: number;
  commissionStatus: string;
  createdAt: string;
  answers: Array<{ key: string; label: string; value: string }>;
  documents: Array<{ id: string; label: string; fileName: string; size: number }>;
}

function whatsappHref(phone: string): string {
  const digits = phone.replace(/\D/g, "").replace(/^0/, "233");
  return `https://wa.me/${digits}`;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function ServiceOrderRow({ order }: { order: AdminOrderView }) {
  const [open, setOpen] = useState(false);
  const status = isServiceStatus(order.status) ? order.status : "pending";

  return (
    <li className="overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-niki-surface/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display font-bold text-niki-ink">{order.customerName}</span>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                SERVICE_STATUS_TONES[status],
              )}
            >
              {SERVICE_STATUS_LABELS[status]}
            </span>
            {order.documents.length > 0 ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-niki-ink/45">
                <Paperclip className="h-3 w-3" />
                {order.documents.length}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-niki-ink/60">
            {order.serviceName} · {order.variantName}
            {order.speedLabel ? ` · ${order.speedLabel}` : ""}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-niki-ink/40">
            {order.reference} · {order.customerPhone} · {order.createdAt}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="font-figures font-bold text-niki-ink">{formatPrice(order.price)}</p>
          {order.agentName ? (
            <p className="text-[11px] text-niki-ink/45">via {order.agentName}</p>
          ) : null}
        </div>

        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-niki-ink/35 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div className="border-t border-niki-edge">
          {/* What they told us */}
          {order.answers.length > 0 ? (
            <dl className="grid gap-x-6 gap-y-3 border-b border-niki-edge bg-niki-surface/50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              {order.answers.map((a) => (
                <div key={a.key}>
                  <dt className="text-[11px] font-medium text-niki-ink/45">{a.label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-medium text-niki-ink">{a.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="border-b border-niki-edge bg-niki-surface/50 p-4 text-sm text-niki-ink/55">
              No form was filled in — this one was registered at the counter.
            </p>
          )}

          {/* What they sent */}
          <div className="border-b border-niki-edge p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
              Documents
            </p>
            {order.documents.length === 0 ? (
              <p className="text-sm text-niki-ink/55">
                {order.paymentStatus === "paid"
                  ? "Nothing attached yet. The customer can attach theirs from the order page."
                  : "Nothing is stored until payment clears."}
              </p>
            ) : (
              <ul className="space-y-2">
                {order.documents.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-niki-surface px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-niki-ink">
                        {d.label}
                      </span>
                      <span className="block truncate text-[11px] text-niki-ink/45">
                        {d.fileName} · {sizeLabel(d.size)}
                      </span>
                    </span>
                    <a
                      href={`/admin/data/products/documents/${d.id}`}
                      download
                      className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-black px-3 py-1.5 text-xs font-semibold text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </a>
                    <form action={deleteServiceDocument}>
                      <input type="hidden" name="id" value={d.id} />
                      <button
                        type="submit"
                        aria-label={`Delete ${d.label}`}
                        className="niki-press rounded-lg p-2 text-niki-ink/40 hover:bg-niki-danger/10 hover:text-niki-danger"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Reach them, and move it on */}
          <div className="flex flex-wrap items-end gap-3 p-4">
            <a
              href={whatsappHref(order.customerPhone)}
              target="_blank"
              rel="noopener noreferrer"
              className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-ghana px-3.5 py-2 text-xs font-semibold text-white"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </a>
            {order.customerEmail ? (
              <a
                href={`mailto:${order.customerEmail}?subject=${encodeURIComponent(
                  `${order.serviceName} — ${order.reference}`,
                )}`}
                className="niki-press flex items-center gap-1.5 rounded-lg bg-niki-surface px-3.5 py-2 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </a>
            ) : null}

            <form action={updateServiceOrder} className="flex flex-1 flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={order.id} />
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-niki-ink/45">Status</span>
                <select
                  name="status"
                  defaultValue={status}
                  className={cn(inputClass, "w-44 py-2")}
                >
                  {SERVICE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {SERVICE_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block min-w-[12rem] flex-1">
                <span className="mb-1 block text-[11px] font-medium text-niki-ink/45">
                  Note for the customer
                </span>
                <input
                  name="adminNote"
                  defaultValue={order.adminNote}
                  placeholder="Shown on their tracker"
                  className={cn(inputClass, "py-2")}
                />
              </label>
              <button
                type="submit"
                className="niki-press rounded-lg bg-niki-orange px-4 py-2.5 text-xs font-bold text-white hover:bg-niki-orange-light"
              >
                Update
              </button>
            </form>
          </div>

          {order.agentName ? (
            <p className="border-t border-niki-edge px-4 py-2.5 text-[11px] text-niki-ink/50">
              {order.agentName} earns {formatPrice(order.agentCommission)} on this —{" "}
              {order.commissionStatus === "earned"
                ? "paid on completion"
                : order.commissionStatus === "void"
                  ? "voided"
                  : "credited when it is marked completed"}
              .
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
