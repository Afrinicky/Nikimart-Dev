"use client";

import { useEffect, useState } from "react";
import { Eye, MessageCircle, X } from "lucide-react";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * A single bundle order, flattened to a plain (serialisable) object so it can
 * cross the server → client boundary and drive both the "order details" and
 * "report not received" dialogs. Dates arrive as ISO strings.
 */
export interface OrderView {
  id: string;
  reference: string;
  network: string;
  sizeGb: number;
  recipientPhone: string;
  price: number;
  status: string;
  paymentStatus: string;
  /** Human label for where the order came from (e.g. "Nickimart", "Agent · Ama"). */
  sourceLabel: string;
  commission?: number | null;
  commissionStatus?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  // Admin-only extras — omitted on the agent side.
  buyerName?: string | null;
  buyerPhone?: string | null;
  costPrice?: number | null;
  providerCode?: string | null;
  providerStatus?: string | null;
  providerMessage?: string | null;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: string }) {
  const known = isDataOrderStatus(status) ? status : "processing";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        DATA_STATUS_TONES[known],
      )}
    >
      {DATA_STATUS_LABELS[known]}
    </span>
  );
}

function PaymentPill({ status }: { status: string }) {
  const paid = status === "paid";
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold",
        paid
          ? "bg-niki-success/10 text-niki-success ring-1 ring-niki-success/30"
          : "bg-niki-danger/10 text-niki-danger ring-1 ring-niki-danger/30",
      )}
    >
      {paid ? "Payment success" : "Payment pending"}
    </span>
  );
}

/** Close the dialog on Escape and lock the body scroll while it is open. */
function useDialog(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

function Shell({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useDialog(true, onClose);
  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-niki-black/70 backdrop-blur-sm sm:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-up relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl sm:max-w-md sm:rounded-3xl sm:pb-0"
      >
        <div className="flex items-center justify-between gap-4 border-b border-niki-edge px-5 py-4">
          <p className="font-display text-lg font-bold text-niki-ink">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="niki-press niki-focus rounded-full p-1.5 text-niki-ink/40 hover:bg-niki-surface hover:text-niki-ink"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 border-t border-niki-edge px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-sm text-niki-ink/55">{label}</dt>
      <dd className="text-right text-sm font-semibold text-niki-ink">{value}</dd>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-niki-surface/60 p-4 ring-1 ring-niki-edge">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">{title}</p>
      <dl className="divide-y divide-niki-edge">{children}</dl>
    </div>
  );
}

function OrderDetailsModal({ order, onClose }: { order: OrderView; onClose: () => void }) {
  const admin = order.buyerPhone != null || order.providerCode != null || order.costPrice != null;
  const margin =
    order.costPrice != null && order.costPrice > 0
      ? Math.round((order.price - order.costPrice) * 100) / 100
      : null;

  return (
    <Shell
      title="Order Details"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-niki-black px-5 py-2 text-sm font-semibold text-white"
        >
          Close
        </button>
      }
    >
      <div className="space-y-3">
        <Panel title="Order Information">
          <DetailRow
            label="Order ID"
            value={<span className="font-mono text-xs">{order.reference}</span>}
          />
          <DetailRow label="Status" value={<StatusPill status={order.status} />} />
          <DetailRow label="Payment" value={<PaymentPill status={order.paymentStatus} />} />
          <DetailRow
            label="Phone"
            value={<span className="font-mono">{order.recipientPhone}</span>}
          />
          <DetailRow label="Network" value={networkLabel(order.network)} />
          <DetailRow label="Size" value={bundleLabel(order.sizeGb)} />
          <DetailRow label="Source" value={order.sourceLabel} />
        </Panel>

        {admin ? (
          <Panel title="Customer">
            {order.buyerName ? <DetailRow label="Name" value={order.buyerName} /> : null}
            {order.buyerPhone ? (
              <DetailRow
                label="Contact"
                value={<span className="font-mono">{order.buyerPhone}</span>}
              />
            ) : null}
            {order.providerCode ? (
              <DetailRow
                label="Provider code"
                value={<span className="font-mono">{order.providerCode}</span>}
              />
            ) : null}
            {order.providerStatus ? (
              <DetailRow label="Provider status" value={order.providerStatus} />
            ) : null}
            {order.providerMessage ? (
              <DetailRow
                label="Latest update"
                value={<span className="font-normal text-niki-ink/70">{order.providerMessage}</span>}
              />
            ) : null}
          </Panel>
        ) : null}

        <Panel title="Pricing & Timeline">
          <DetailRow label="Price" value={formatMoney(order.price)} />
          {order.commission != null && order.commission > 0 ? (
            <DetailRow
              label="Commission"
              value={
                <span
                  className={cn(
                    order.commissionStatus === "earned"
                      ? "text-niki-success"
                      : order.commissionStatus === "void"
                        ? "text-niki-ink/35 line-through"
                        : "text-niki-ink/60",
                  )}
                >
                  {formatMoney(order.commission)}
                </span>
              }
            />
          ) : null}
          {order.costPrice != null && order.costPrice > 0 ? (
            <DetailRow label="Cost" value={formatMoney(order.costPrice)} />
          ) : null}
          {margin != null ? <DetailRow label="Margin" value={formatMoney(margin)} /> : null}
          <DetailRow label="Created" value={formatWhen(order.createdAt)} />
          {order.updatedAt ? (
            <DetailRow label="Updated" value={formatWhen(order.updatedAt)} />
          ) : null}
        </Panel>
      </div>
    </Shell>
  );
}

/** Build the WhatsApp deep link that pre-fills the complaint message. */
function reportHref(order: OrderView, whatsapp: string): string {
  const digits = whatsapp.replace(/\D/g, "");
  const lines = [
    "Hello, I have not received this data bundle order:",
    "",
    `Order ID: ${order.reference}`,
    `Phone: ${order.recipientPhone}`,
    `Network: ${networkLabel(order.network)}`,
    `Size: ${bundleLabel(order.sizeGb)}`,
    `Price: ${formatMoney(order.price)}`,
  ];
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function ReportModal({
  order,
  whatsapp,
  onClose,
}: {
  order: OrderView;
  whatsapp: string;
  onClose: () => void;
}) {
  return (
    <Shell
      title="Report Not received"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/60 hover:text-niki-ink"
          >
            Cancel
          </button>
          <a
            href={reportHref(order, whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full bg-niki-success px-5 py-2 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            Open WhatsApp
          </a>
        </>
      }
    >
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-niki-success/10 text-niki-success">
          <MessageCircle className="h-6 w-6" />
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          Report this order as not received?
        </p>
        <p className="mt-1 text-sm text-niki-ink/60">
          This will open WhatsApp with the order details so our complaint team can review it.
        </p>
      </div>

      <div className="mt-4">
        <Panel title="Order">
          <DetailRow
            label="Order ID"
            value={<span className="font-mono text-xs">{order.reference}</span>}
          />
          <DetailRow label="Phone" value={<span className="font-mono">{order.recipientPhone}</span>} />
          <DetailRow label="Network" value={networkLabel(order.network)} />
          <DetailRow label="Size" value={bundleLabel(order.sizeGb)} />
          <DetailRow label="Price" value={formatMoney(order.price)} />
        </Panel>
      </div>
    </Shell>
  );
}

const iconBtn =
  "niki-press niki-focus inline-flex h-8 w-8 items-center justify-center rounded-full text-niki-trust ring-1 ring-niki-edge hover:bg-niki-trust/10";

/**
 * The Actions cell for one order row: an eye (order details) and, when a
 * support number is supplied, a chat bubble (report not received). Both open a
 * dialog rendered from this client island so the surrounding table can stay a
 * server component.
 */
export function OrderActions({ order, whatsapp }: { order: OrderView; whatsapp?: string }) {
  const [open, setOpen] = useState<null | "details" | "report">(null);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="View order details"
        title="View details"
        className={iconBtn}
        onClick={() => setOpen("details")}
      >
        <Eye className="h-4 w-4" />
      </button>
      {whatsapp ? (
        <button
          type="button"
          aria-label="Report not received"
          title="Report not received"
          className={iconBtn}
          onClick={() => setOpen("report")}
        >
          <MessageCircle className="h-4 w-4" />
        </button>
      ) : null}

      {open === "details" ? (
        <OrderDetailsModal order={order} onClose={() => setOpen(null)} />
      ) : null}
      {open === "report" && whatsapp ? (
        <ReportModal order={order} whatsapp={whatsapp} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
