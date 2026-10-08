"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Check,
  Eye,
  Loader2,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Undo2,
  X,
} from "lucide-react";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { cancelOrderAction } from "@/lib/data-bundles/order-actions";
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
  /**
   * True when an agent made this sale, so a refund has a wallet to land in.
   * Nickimart's own orders are refunded in Paystack instead, and the dialog
   * must not promise a credit that will never appear.
   */
  agentSale?: boolean;
  commission?: number | null;
  commissionStatus?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  // Admin-only extras — omitted on the agent side.
  buyerName?: string | null;
  buyerPhone?: string | null;
  costPrice?: number | null;
  providerCode?: string | null;
  /** Set once the order has been accepted upstream — the admin's retry gate. */
  providerOrderId?: string | null;
  providerStatus?: string | null;
  providerMessage?: string | null;
  /** Who recorded this payment by hand, where nobody could do it automatically. */
  settledBy?: string | null;
  /** A buyer's open claim that the money left their wallet. Admin side only. */
  claim?: OrderClaimView | null;
}

/** An open "I was debited" claim, flattened for the dialog. */
export interface OrderClaimView {
  id: string;
  contact: string;
  note: string;
  raisedBy: string;
  createdAt: string;
}

/**
 * The admin-only buttons, handed in as server actions from the console page.
 *
 * They are props rather than imports because this dialog is shared: the agent
 * console renders the same component and must not be able to reach a dispatch
 * or a bookkeeping flip, whatever a browser sends.
 */
export interface AdminOrderForms {
  /** Send a paid order to the provider again. */
  retry?: (fd: FormData) => Promise<void>;
  /** Ask the provider where an order got to. */
  refresh?: (fd: FormData) => Promise<void>;
  /** Record that a failed order has been refunded in Paystack. */
  markRefunded?: (fd: FormData) => Promise<void>;
  /** Ask Paystack whether an unpaid order was in fact charged for. */
  recheckPayment?: (reference: string) => Promise<PaymentActionFeedback>;
  /** Record the payment on the admin's own word and send the bundle. */
  settlePayment?: (orderId: string) => Promise<PaymentActionFeedback>;
  /** Confirm or turn down a buyer's claim. Confirming sends the bundle. */
  decideClaim?: (
    claimId: string,
    decision: "confirm" | "reject",
    reason: string,
  ) => Promise<PaymentActionFeedback>;
  /** Buy a failed order again, upstream. Spends money, so it asks first. */
  reorder?: (orderId: string) => Promise<PaymentActionFeedback>;
}

export interface PaymentActionFeedback {
  ok: boolean;
  message: string;
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
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-niki-edge px-5 py-4">
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

const ghostBtn =
  "niki-press niki-focus rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/60 hover:text-niki-ink";
const darkBtn =
  "niki-press niki-focus rounded-full bg-niki-black px-5 py-2 text-sm font-semibold text-white";
const dangerBtn =
  "niki-press niki-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-niki-danger hover:bg-niki-danger/10";
const quietBtn =
  "niki-press niki-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-niki-ink/65 ring-1 ring-niki-edge hover:bg-niki-black/5";

/**
 * Cancel & refund, asked properly.
 *
 * It replaces the detail panels rather than stacking a second dialog on top of
 * the first: a confirmation nobody can read past is a confirmation nobody
 * reads. What the money does next is spelled out, because for an agent sale it
 * does not go back to the card — it lands in the agent's wallet.
 */
function CancelPanel({
  order,
  onDone,
  onBack,
}: {
  order: OrderView;
  onDone: () => void;
  onBack: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(order.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone();
    });
  }

  return (
    <>
      <div className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-niki-danger/10 text-niki-danger">
          <Undo2 className="h-6 w-6" />
        </span>
        <p className="mt-3 font-display text-lg font-bold text-niki-ink">
          Cancel this order and refund it?
        </p>
        <p className="mt-1 text-sm text-niki-ink/60">
          The bundle is still queued, so it can be pulled back.{" "}
          {order.agentSale === false
            ? `${formatMoney(order.price)} then has to be sent back in Paystack — this only records it.`
            : `${formatMoney(order.price)} is credited to the wallet — ready to withdraw or spend on another order.`}{" "}
          This can&apos;t be undone.
        </p>
      </div>

      {error ? (
        <p className="animate-fade-up mt-4 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Panel title="Order">
          <DetailRow
            label="Order ID"
            value={<span className="font-mono text-xs">{order.reference}</span>}
          />
          <DetailRow label="Network" value={networkLabel(order.network)} />
          <DetailRow label="Size" value={bundleLabel(order.sizeGb)} />
          <DetailRow label="Refund" value={formatMoney(order.price)} />
        </Panel>
      </div>

      <div className="mt-5 flex gap-3">
        <button type="button" onClick={onBack} disabled={pending} className={cn(ghostBtn, "flex-1")}>
          Keep order
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={pending}
          className="niki-press niki-focus flex-[1.4] rounded-full bg-niki-danger px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Refunding…" : "Cancel & Refund"}
        </button>
      </div>
    </>
  );
}

/**
 * Settling an order the gateway never confirmed.
 *
 * It sits at the foot of the details card and only on an order that reads
 * awaiting payment, because that is the only order it means anything for. The
 * three moves are in the order they should be tried, and the panel says so:
 * ask Paystack first, since an interrupted checkout is usually a settlement
 * that simply never ran; then the buyer's claim, if one has been raised; and
 * only then record it by hand, which hands over a bundle on somebody's word
 * and stamps whose word it was.
 */
function SettlementPanel({
  order,
  forms,
  onSettled,
}: {
  order: OrderView;
  forms: AdminOrderForms;
  onSettled: () => void;
}) {
  const [busy, setBusy] = useState<null | "recheck" | "settle" | "confirm" | "reject">(null);
  const [notice, setNotice] = useState<PaymentActionFeedback | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();
  const claim = order.claim ?? null;

  function run(
    key: "recheck" | "settle" | "confirm" | "reject",
    work: () => Promise<PaymentActionFeedback>,
  ) {
    setNotice(null);
    setBusy(key);
    void work()
      .then((result) => {
        setNotice(result);
        if (result.ok) {
          router.refresh();
          onSettled();
        }
      })
      .catch(() => setNotice({ ok: false, message: "That didn't go through. Try again." }))
      .finally(() => setBusy(null));
  }

  return (
    <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
        Payment settlement
      </p>
      <p className="text-sm text-amber-900/80">
        This order has not been confirmed as paid, so no bundle has been sent. Ask the gateway
        first — an interrupted checkout is usually a settlement that never ran.
      </p>

      {claim ? (
        <div className="mt-3 rounded-xl bg-white p-3 ring-1 ring-amber-200">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-niki-danger">
            <ShieldAlert className="h-3.5 w-3.5" />
            Claim from the buyer
          </p>
          <p className="mt-1 text-sm text-niki-ink">
            Paid from <span className="font-mono font-semibold">{claim.contact}</span>
            {claim.note ? <span className="text-niki-ink/70"> — {claim.note}</span> : null}
          </p>
          <p className="mt-0.5 text-xs text-niki-ink/45">Raised {formatWhen(claim.createdAt)}</p>
        </div>
      ) : null}

      {notice ? (
        <p
          className={cn(
            "animate-fade-up mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium",
            notice.ok
              ? "bg-niki-success/10 text-niki-success"
              : "bg-niki-danger/10 text-niki-danger",
          )}
        >
          {notice.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{notice.message}</span>
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {forms.recheckPayment ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run("recheck", () => forms.recheckPayment!(order.reference))}
            className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy === "recheck" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {busy === "recheck" ? "Asking Paystack…" : "Check Paystack"}
          </button>
        ) : null}

        {claim && forms.decideClaim ? (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("confirm", () => forms.decideClaim!(claim.id, "confirm", ""))}
              className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-success px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy === "confirm" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
              Confirm claim & send
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => run("reject", () => forms.decideClaim!(claim.id, "reject", reason))}
              className={dangerBtn}
            >
              <X className="h-4 w-4" />
              Reject claim
            </button>
          </>
        ) : null}
      </div>

      {forms.settlePayment ? (
        <div className="mt-3 border-t border-amber-200 pt-3">
          {confirming ? (
            <div className="animate-fade-up">
              <p className="text-sm font-semibold text-amber-900">
                Record {formatMoney(order.price)} as received and send the bundle?
              </p>
              <p className="mt-0.5 text-xs text-amber-900/70">
                Paystack has not confirmed this. The bundle goes out at once and your name is
                recorded against it.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => run("settle", () => forms.settlePayment!(order.id))}
                  className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy === "settle" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {busy === "settle" ? "Sending…" : "Yes, mark paid & send"}
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => setConfirming(false)}
                  className={ghostBtn}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
              className="niki-press niki-focus text-sm font-semibold text-amber-800 underline-offset-2 hover:underline"
            >
              Mark paid by hand and send the bundle
            </button>
          )}
        </div>
      ) : null}

      {claim && forms.decideClaim ? (
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why you're rejecting it (optional)"
          className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs text-niki-ink outline-none focus:border-niki-orange"
        />
      ) : null}
    </div>
  );
}

/**
 * Ordering a failed bundle again.
 *
 * The ordinary "send to provider" refuses an order that already carries a
 * provider id, which is the guard that stops a retry buying the same bundle
 * twice. A provider that accepted an order and then failed it leaves one
 * stranded behind that guard — paid for, and never delivered.
 *
 * So this is the way through, and it asks first, because the one case it
 * cannot tell apart is a bundle the provider delivered and then reported
 * wrongly. Whoever presses it is the person who knows.
 */
function ReorderPanel({
  order,
  reorder,
}: {
  order: OrderView;
  reorder: (orderId: string) => Promise<PaymentActionFeedback>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<PaymentActionFeedback | null>(null);

  function send() {
    setNotice(null);
    setBusy(true);
    void reorder(order.id)
      .then((result) => {
        setNotice(result);
        setAsking(false);
        if (result.ok) router.refresh();
      })
      .catch(() => setNotice({ ok: false, message: "That didn't go through. Try again." }))
      .finally(() => setBusy(false));
  }

  return (
    <div className="rounded-2xl bg-niki-danger/[0.06] p-4 ring-1 ring-niki-danger/20">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-niki-danger">
        Delivery failed
      </p>
      <p className="text-sm text-niki-ink/75">
        This one was paid for and never landed. Ordering it again buys a fresh bundle from the
        provider at {order.costPrice != null && order.costPrice > 0 ? formatMoney(order.costPrice) : "the current cost"}.
      </p>

      {notice ? (
        <p
          className={cn(
            "animate-fade-up mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium",
            notice.ok ? "bg-niki-success/10 text-niki-success" : "bg-niki-danger/10 text-niki-danger",
          )}
        >
          {notice.ok ? (
            <Check className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>{notice.message}</span>
        </p>
      ) : null}

      <div className="mt-3">
        {asking ? (
          <div className="animate-fade-up">
            <p className="text-sm font-semibold text-niki-ink">
              Order {bundleLabel(order.sizeGb)} {networkLabel(order.network)} for{" "}
              {order.recipientPhone} again?
            </p>
            <p className="mt-0.5 text-xs text-niki-ink/60">
              Check the number has not already received it — the provider reporting a failure it
              did deliver is the one case this cannot tell apart.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={send}
                className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-orange px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                {busy ? "Ordering…" : "Yes, order it again"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAsking(false)}
                className={ghostBtn}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-niki-black px-4 py-2 text-sm font-semibold text-white"
          >
            <RotateCcw className="h-4 w-4" />
            Order again
          </button>
        )}
      </div>
    </div>
  );
}

function OrderDetailsModal({
  order,
  whatsapp,
  adminForms,
  onReport,
  onClose,
}: {
  order: OrderView;
  whatsapp?: string;
  adminForms?: AdminOrderForms;
  onReport?: () => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<"details" | "cancel" | "done">("details");
  const admin = order.buyerPhone != null || order.providerCode != null || order.costPrice != null;
  const margin =
    order.costPrice != null && order.costPrice > 0
      ? Math.round((order.price - order.costPrice) * 100) / 100
      : null;

  // What this order can still have done to it. Cancelling is queued-only — an
  // order already with the network is not ours to pull back — and reporting is
  // for a delivery the customer says never arrived.
  const canCancel = order.status === "queued";
  const canReport = order.status === "completed" && Boolean(whatsapp) && Boolean(onReport);
  // Awaiting payment, and the console that opened this can do something about
  // it. The agent side passes no admin forms, so it never sees this.
  const canSettle =
    order.paymentStatus !== "paid" &&
    order.status === "pending" &&
    Boolean(adminForms?.recheckPayment || adminForms?.settlePayment);
  // Paid for and never delivered. The ordinary retry cannot reach it once the
  // provider has given the order an id of its own.
  const canReorder =
    order.status === "failed" && order.paymentStatus === "paid" && Boolean(adminForms?.reorder);

  if (view === "cancel") {
    return (
      <Shell title="Cancel & Refund" onClose={onClose}>
        <CancelPanel
          order={order}
          onBack={() => setView("details")}
          onDone={() => setView("done")}
        />
      </Shell>
    );
  }

  if (view === "done") {
    return (
      <Shell
        title="Order cancelled"
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose} className={darkBtn}>
            Done
          </button>
        }
      >
        <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
          <Check className="mx-auto h-8 w-8 text-niki-success" />
          <p className="mt-2 font-display font-bold text-niki-ink">
            {order.agentSale === false ? "Order cancelled" : "Refunded to the wallet"}
          </p>
          <p className="mt-1 text-sm text-niki-ink/70">
            {order.agentSale === false ? (
              <>
                Order <span className="font-mono font-semibold">{order.reference}</span> is marked
                refunded. Send the {formatMoney(order.price)} back in Paystack.
              </>
            ) : (
              <>
                {formatMoney(order.price)} from order{" "}
                <span className="font-mono font-semibold">{order.reference}</span> is now on the
                balance.
              </>
            )}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell
      title="Order Details"
      onClose={onClose}
      footer={
        <>
          {canCancel ? (
            <button type="button" onClick={() => setView("cancel")} className={dangerBtn}>
              <X className="h-4 w-4" />
              Cancel & Refund
            </button>
          ) : null}

          {canReport ? (
            <button type="button" onClick={onReport} className={quietBtn}>
              <MessageCircle className="h-4 w-4" />
              Report Not received
            </button>
          ) : null}

          {adminForms?.retry && order.paymentStatus === "paid" && !order.providerOrderId ? (
            <form action={adminForms.retry}>
              <input type="hidden" name="id" value={order.id} />
              <button type="submit" className={quietBtn}>
                <RotateCcw className="h-4 w-4" />
                Send to provider
              </button>
            </form>
          ) : null}

          {adminForms?.refresh && order.providerOrderId ? (
            <form action={adminForms.refresh}>
              <input type="hidden" name="id" value={order.id} />
              <button type="submit" className={quietBtn}>
                <RefreshCw className="h-4 w-4" />
                Refresh status
              </button>
            </form>
          ) : null}

          {adminForms?.markRefunded && order.status === "failed" ? (
            <form action={adminForms.markRefunded}>
              <input type="hidden" name="id" value={order.id} />
              <button type="submit" className={quietBtn}>
                <Undo2 className="h-4 w-4" />
                Mark refunded
              </button>
            </form>
          ) : null}

          <button type="button" onClick={onClose} className={darkBtn}>
            Close
          </button>
        </>
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
          {order.settledBy ? (
            <DetailRow label="Settled by hand" value={order.settledBy} />
          ) : null}
        </Panel>

        {/* Last in the card, and only on an order that is waiting for money.
            Everything above describes the order; this is the one thing that
            can still change what happens to it. */}
        {canSettle ? (
          <SettlementPanel order={order} forms={adminForms!} onSettled={onClose} />
        ) : null}

        {canReorder ? <ReorderPanel order={order} reorder={adminForms!.reorder!} /> : null}
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
          <button type="button" onClick={onClose} className={ghostBtn}>
            Cancel
          </button>
          <a
            href={reportHref(order, whatsapp)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="niki-press inline-flex items-center gap-2 rounded-full bg-niki-success px-5 py-2 text-sm font-semibold text-white"
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
 * The Actions cell for one order row: an eye and a chat bubble, and nothing
 * else. Everything that can be *done* to an order — cancel and refund, report
 * a delivery that never arrived, the admin's dispatch and bookkeeping buttons
 * — lives inside the dialog the eye opens, where there is room to say what
 * each one means. A row of five icons cannot.
 */
export function OrderActions({
  order,
  whatsapp,
  adminForms,
}: {
  order: OrderView;
  whatsapp?: string;
  adminForms?: AdminOrderForms;
}) {
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
        <OrderDetailsModal
          order={order}
          whatsapp={whatsapp}
          adminForms={adminForms}
          onReport={whatsapp ? () => setOpen("report") : undefined}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === "report" && whatsapp ? (
        <ReportModal order={order} whatsapp={whatsapp} onClose={() => setOpen(null)} />
      ) : null}
    </div>
  );
}
