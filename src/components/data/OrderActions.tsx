"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRightLeft,
  BadgeCheck,
  Check,
  ChevronRight,
  Eye,
  Loader2,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Undo2,
  Wallet,
  X,
} from "lucide-react";
import {
  DATA_STATUS_LABELS,
  DATA_STATUS_TONES,
  bundleLabel,
  isDataOrderStatus,
  networkLabel,
} from "@/lib/data-bundles/networks";
import { cancelOrderAction, recreditOrderAction } from "@/lib/data-bundles/order-actions";
import {
  canRecreditOrder,
  canRefundOrder,
  canReorderOrder,
} from "@/lib/data-bundles/refund-rules";
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
   * WEB | STOREFRONT | AGENT | ADMIN. Read for one decision only: an AGENT
   * order was bought by the agent themselves, usually out of their own wallet,
   * so refunding the buyer instead of the wallet leaves the agent short of
   * money they have already paid. The sheet says so rather than refusing it.
   */
  source?: string | null;
  /**
   * True when an agent made this sale, so a refund has a wallet to land in.
   * Nickimart's own orders can only be refunded to the buyer, and the sheet
   * must not offer a credit that will never appear.
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
  /** Set once the order has been accepted upstream. */
  providerOrderId?: string | null;
  providerStatus?: string | null;
  providerMessage?: string | null;
  /** The number this order was bought for, where a re-credit moved it since. */
  originalRecipientPhone?: string | null;
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
 * The admin-only actions, handed in as server actions from the console page.
 *
 * They are props rather than imports because this sheet is shared: the agent
 * console renders the same component and must not be able to reach a dispatch
 * or a decision on somebody's claim, whatever a browser sends.
 */
export interface AdminOrderForms {
  /** Ask the provider where an order got to. */
  refresh?: (fd: FormData) => Promise<void>;
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
  /** Send this order to the provider again. Spends money, so it asks first. */
  reorder?: (orderId: string) => Promise<PaymentActionFeedback>;
}

export interface PaymentActionFeedback {
  ok: boolean;
  message: string;
}

/** The MoMo networks a refund can be sent on. */
const MOMO_NETWORKS = ["MTN MoMo", "Telecel Cash", "AirtelTigo Money"] as const;

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
  caption,
  onClose,
  onBack,
  children,
  footer,
}: {
  title: string;
  caption?: string;
  onClose: () => void;
  onBack?: () => void;
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
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-niki-edge bg-white/95 px-5 py-4 backdrop-blur">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back"
              className="niki-press niki-focus -ml-1 rounded-full p-1.5 text-niki-ink/40 hover:bg-niki-surface hover:text-niki-ink"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold leading-tight text-niki-ink">{title}</p>
            {caption ? (
              <p className="truncate text-xs text-niki-ink/45">{caption}</p>
            ) : null}
          </div>
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
          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-niki-edge bg-white/95 px-5 py-4 backdrop-blur">
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
  "niki-press niki-focus rounded-full px-4 py-2.5 text-sm font-semibold text-niki-ink/60 hover:bg-niki-surface hover:text-niki-ink";
const darkBtn =
  "niki-press niki-focus rounded-full bg-niki-black px-5 py-2.5 text-sm font-semibold text-white";
const field =
  "w-full rounded-xl border border-niki-edge-strong bg-white px-3.5 py-2.5 text-sm text-niki-ink outline-none transition-colors focus:border-niki-orange";

/**
 * One thing that can be done to this order.
 *
 * A row rather than a pill, which is the whole of the redesign: the actions
 * used to be a wrap of five same-shaped buttons in the footer, where the
 * difference between refreshing a status and refunding a sale was a word and a
 * colour. A row has room for the word *and* the sentence under it, so nothing
 * irreversible is one mis-tap away from something routine.
 */
function ActionRow({
  icon: Icon,
  label,
  caption,
  tone = "neutral",
  busy,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  caption: string;
  tone?: "neutral" | "primary" | "danger";
  busy?: boolean;
  onClick: () => void;
}) {
  const chip = {
    neutral: "bg-niki-surface text-niki-ink/60 ring-niki-edge",
    primary: "bg-niki-orange/10 text-niki-orange ring-niki-orange/20",
    danger: "bg-niki-danger/10 text-niki-danger ring-niki-danger/20",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="niki-press niki-focus group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-niki-surface/70 disabled:opacity-60"
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1",
          chip,
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-sm font-semibold",
            tone === "danger" ? "text-niki-danger" : "text-niki-ink",
          )}
        >
          {label}
        </span>
        <span className="block text-xs leading-snug text-niki-ink/50">{caption}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-niki-ink/25 transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function Notice({ feedback }: { feedback: PaymentActionFeedback }) {
  return (
    <p
      className={cn(
        "animate-fade-up mt-4 flex items-start gap-2 rounded-xl px-3.5 py-3 text-sm font-medium",
        feedback.ok ? "bg-niki-success/10 text-niki-success" : "bg-niki-danger/10 text-niki-danger",
      )}
    >
      {feedback.ok ? (
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{feedback.message}</span>
    </p>
  );
}

/** The headline every confirmation view opens with. */
function Prompt({
  icon: Icon,
  tone,
  title,
  children,
}: {
  icon: React.ElementType;
  tone: "danger" | "primary" | "trust";
  title: string;
  children: React.ReactNode;
}) {
  const chip = {
    danger: "bg-niki-danger/10 text-niki-danger",
    primary: "bg-niki-orange/10 text-niki-orange",
    trust: "bg-niki-trust/10 text-niki-trust",
  }[tone];
  return (
    <div className="text-center">
      <span
        className={cn("mx-auto flex h-12 w-12 items-center justify-center rounded-2xl", chip)}
      >
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-3 font-display text-lg font-bold text-niki-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-niki-ink/60">{children}</p>
    </div>
  );
}

/** The two or three things one order can be refunded to. */
function DestinationCard({
  active,
  fixed,
  icon: Icon,
  title,
  caption,
  onSelect,
}: {
  active: boolean;
  /** The only destination this order has, so it reads rather than chooses. */
  fixed?: boolean;
  icon: React.ElementType;
  title: string;
  caption: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={fixed}
      aria-pressed={active}
      className={cn(
        "niki-focus flex w-full items-start gap-3 rounded-2xl p-3.5 text-left ring-1 transition-colors",
        !fixed && "niki-press hover:bg-niki-surface/60",
        active
          ? "bg-niki-orange/[0.06] ring-niki-orange"
          : "bg-white ring-niki-edge",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-niki-orange text-white" : "bg-niki-surface text-niki-ink/50",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-niki-ink">{title}</span>
        <span className="block text-xs leading-snug text-niki-ink/50">{caption}</span>
      </span>
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ring-1",
          active ? "bg-niki-orange ring-niki-orange" : "ring-niki-edge-strong",
        )}
      >
        {active ? <Check className="h-3 w-3 text-white" /> : null}
      </span>
    </button>
  );
}

/**
 * Cancel & refund, asked properly.
 *
 * It replaces the detail panels rather than stacking a second dialog on top of
 * the first: a confirmation nobody can read past is a confirmation nobody
 * reads. Where the money goes is now a choice rather than a sentence, because
 * it genuinely is one — an agent sale can go back to the agent's wallet, where
 * they settle their own customer, or straight to the buyer on MoMo. Only an
 * administrator gets the choice; an agent's refund lands in their own wallet,
 * which is the only place they are allowed to send Nickimart's money.
 */
function CancelPanel({
  order,
  admin,
  onDone,
}: {
  order: OrderView;
  admin: boolean;
  onDone: (feedback: { title: string; message: string }) => void;
}) {
  const router = useRouter();
  const walletPossible = order.agentSale !== false;
  const choosable = admin && walletPossible;
  const [destination, setDestination] = useState<"WALLET" | "BUYER_MOMO">(
    walletPossible ? "WALLET" : "BUYER_MOMO",
  );
  const [momoPhone, setMomoPhone] = useState(order.buyerPhone ?? "");
  const [momoName, setMomoName] = useState(order.buyerName ?? "");
  const [momoNetwork, setMomoNetwork] = useState<string>(MOMO_NETWORKS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const unpaid = order.paymentStatus !== "paid";
  const toBuyer = destination === "BUYER_MOMO";

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelOrderAction(order.id, {
        destination,
        momoPhone,
        momoName,
        momoNetwork,
        note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone({
        title:
          result.destination === "BUYER_MOMO"
            ? result.owedToBuyer > 0
              ? "Refund queued for the buyer"
              : "Order cancelled"
            : result.credited > 0
              ? "Refunded to the wallet"
              : "Order cancelled",
        message: result.message,
      });
    });
  }

  return (
    <>
      <Prompt
        icon={Undo2}
        tone="danger"
        title={unpaid ? "Cancel this order?" : "Cancel this order and refund it?"}
      >
        {unpaid
          ? "Nothing was charged for it, so there is nothing to send back."
          : `The full ${formatMoney(order.price)} goes back. This can't be undone.`}
      </Prompt>

      {!unpaid ? (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
            Refund to
          </p>
          <div className="space-y-2">
            {walletPossible ? (
              <DestinationCard
                active={destination === "WALLET"}
                fixed={!choosable}
                icon={Wallet}
                title="Agent wallet"
                caption={`${formatMoney(order.price)} on the balance, to withdraw or spend`}
                onSelect={() => setDestination("WALLET")}
              />
            ) : null}
            {admin ? (
              <DestinationCard
                active={toBuyer}
                fixed={!walletPossible}
                icon={Smartphone}
                title="Buyer's mobile money"
                caption="Queued for transfer, and tracked until it is sent"
                onSelect={() => setDestination("BUYER_MOMO")}
              />
            ) : null}
          </div>
          {toBuyer && order.source === "AGENT" ? (
            <p className="animate-fade-up mt-2 flex items-start gap-1.5 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-900/80 ring-1 ring-amber-200">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                The agent bought this one themselves, so the money came off their own balance.
                Refunding the buyer instead leaves the agent short of it.
              </span>
            </p>
          ) : null}
          {!choosable && !admin ? (
            <p className="mt-2 text-xs text-niki-ink/45">
              Send the customer their money on MoMo once the balance is credited.
            </p>
          ) : null}
        </div>
      ) : null}

      {!unpaid && toBuyer ? (
        <div className="animate-fade-up mt-4 space-y-2.5 rounded-2xl bg-niki-surface/60 p-4 ring-1 ring-niki-edge">
          <p className="text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
            Where to send it
          </p>
          <div>
            <label className="text-xs font-medium text-niki-ink/60" htmlFor="refund-momo-phone">
              Mobile money number
            </label>
            <input
              id="refund-momo-phone"
              value={momoPhone}
              onChange={(e) => setMomoPhone(e.target.value)}
              inputMode="numeric"
              placeholder="0XXXXXXXXX"
              className={cn(field, "mt-1 font-mono")}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-niki-ink/60" htmlFor="refund-momo-name">
              Account name
            </label>
            <input
              id="refund-momo-name"
              value={momoName}
              onChange={(e) => setMomoName(e.target.value)}
              placeholder="As registered on MoMo"
              className={cn(field, "mt-1")}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-niki-ink/60" htmlFor="refund-momo-network">
              Network
            </label>
            <select
              id="refund-momo-network"
              value={momoNetwork}
              onChange={(e) => setMomoNetwork(e.target.value)}
              className={cn(field, "mt-1 appearance-none font-medium")}
            >
              {MOMO_NETWORKS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {!unpaid ? (
        <div className="mt-3">
          <label className="text-xs font-medium text-niki-ink/60" htmlFor="refund-note">
            Reason <span className="text-niki-ink/35">(optional)</span>
          </label>
          <input
            id="refund-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Wrong number, customer cancelled…"
            className={cn(field, "mt-1")}
          />
        </div>
      ) : null}

      {error ? <Notice feedback={{ ok: false, message: error }} /> : null}

      <div className="mt-4">
        <Panel title="Order">
          <DetailRow
            label="Order ID"
            value={<span className="font-mono text-xs">{order.reference}</span>}
          />
          <DetailRow
            label="Bundle"
            value={`${bundleLabel(order.sizeGb)} ${networkLabel(order.network)}`}
          />
          <DetailRow label="Number" value={<span className="font-mono">{order.recipientPhone}</span>} />
          <DetailRow label="Refund" value={formatMoney(unpaid ? 0 : order.price)} />
        </Panel>
      </div>

      <button
        type="button"
        onClick={confirm}
        disabled={pending}
        className="niki-press niki-focus mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-niki-danger px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
        {pending
          ? "Working…"
          : unpaid
            ? "Cancel order"
            : toBuyer
              ? "Cancel & refund the buyer"
              : "Cancel & refund the wallet"}
      </button>
    </>
  );
}

/**
 * Sending the bundle somewhere else instead of refunding it.
 *
 * Behind most queued orders nobody wants, and most failed ones nobody can
 * rescue, is a mistyped number. Refunding and re-buying costs a round trip
 * through the wallet and throws away the reference the customer was given;
 * what is wanted is the same purchase, delivered to the right number. So this
 * keeps the order and moves it.
 */
function RecreditPanel({
  order,
  onDone,
}: {
  order: OrderView;
  onDone: (feedback: { title: string; message: string }) => void;
}) {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await recreditOrderAction(order.id, phone);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onDone({ title: "Bundle on its way", message: result.message });
    });
  }

  return (
    <>
      <Prompt icon={ArrowRightLeft} tone="trust" title="Credit another number">
        This cancels the attempt on {order.recipientPhone} and sends the same{" "}
        {bundleLabel(order.sizeGb)} to a new {networkLabel(order.network)} number. Nothing is
        charged again.
      </Prompt>

      <div className="mt-5">
        <label className="text-xs font-medium text-niki-ink/60" htmlFor="recredit-phone">
          New {networkLabel(order.network)} number
        </label>
        <input
          id="recredit-phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="numeric"
          autoFocus
          placeholder="0XXXXXXXXX"
          className={cn(field, "mt-1 font-mono text-base tracking-wide")}
        />
        <p className="mt-1.5 text-xs text-niki-ink/45">
          It has to be on {networkLabel(order.network)} — data sent to the wrong network can&apos;t
          be reversed.
        </p>
      </div>

      {error ? <Notice feedback={{ ok: false, message: error }} /> : null}

      <div className="mt-4">
        <Panel title="Order">
          <DetailRow
            label="Order ID"
            value={<span className="font-mono text-xs">{order.reference}</span>}
          />
          <DetailRow
            label="Bundle"
            value={`${bundleLabel(order.sizeGb)} ${networkLabel(order.network)}`}
          />
          <DetailRow
            label="Bought for"
            value={<span className="font-mono">{order.recipientPhone}</span>}
          />
        </Panel>
      </div>

      <button
        type="button"
        onClick={confirm}
        disabled={pending || phone.trim().length < 9}
        className="niki-press niki-focus mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-niki-trust px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowRightLeft className="h-4 w-4" />
        )}
        {pending ? "Sending…" : "Cancel & credit this number"}
      </button>
    </>
  );
}

/**
 * Buying the bundle from the provider again.
 *
 * One confirmation for what used to be two buttons — "Send to provider" and
 * "Order again" — doing the same job behind an invisible gate. It spends money
 * upstream, and the one case it cannot tell apart is a bundle the provider
 * delivered and then reported wrongly, so whoever presses it is asked to check
 * the number first.
 */
function ReorderPanel({
  order,
  reorder,
  onDone,
}: {
  order: OrderView;
  reorder: (orderId: string) => Promise<PaymentActionFeedback>;
  onDone: (feedback: { title: string; message: string }) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<PaymentActionFeedback | null>(null);

  function send() {
    setNotice(null);
    setBusy(true);
    void reorder(order.id)
      .then((result) => {
        if (result.ok) {
          router.refresh();
          onDone({ title: "Ordered again", message: result.message });
          return;
        }
        setNotice(result);
      })
      .catch(() => setNotice({ ok: false, message: "That didn't go through. Try again." }))
      .finally(() => setBusy(false));
  }

  return (
    <>
      <Prompt icon={RotateCcw} tone="primary" title="Re-order this bundle?">
        {bundleLabel(order.sizeGb)} {networkLabel(order.network)} is bought from the provider again
        for {order.recipientPhone}. The customer is not charged twice.
      </Prompt>

      <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900/80 ring-1 ring-amber-200">
        Check the number has not already received it. A provider reporting a failure it did deliver
        is the one case this cannot tell apart.
      </p>

      {notice ? <Notice feedback={notice} /> : null}

      <div className="mt-4">
        <Panel title="Order">
          <DetailRow
            label="Order ID"
            value={<span className="font-mono text-xs">{order.reference}</span>}
          />
          <DetailRow label="Number" value={<span className="font-mono">{order.recipientPhone}</span>} />
          <DetailRow
            label="Upstream cost"
            value={
              order.costPrice != null && order.costPrice > 0
                ? formatMoney(order.costPrice)
                : "At today's rate"
            }
          />
          {order.providerMessage ? (
            <DetailRow
              label="Last attempt"
              value={
                <span className="font-normal text-niki-ink/70">{order.providerMessage}</span>
              }
            />
          ) : null}
        </Panel>
      </div>

      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="niki-press niki-focus mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
        {busy ? "Ordering…" : "Yes, re-order it"}
      </button>
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
              className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-niki-danger hover:bg-niki-danger/10"
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

type SheetView = "details" | "cancel" | "recredit" | "reorder" | "done";

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
  const [view, setView] = useState<SheetView>("details");
  const [done, setDone] = useState<{ title: string; message: string } | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const admin = Boolean(adminForms);
  const showsTrade = order.buyerPhone != null || order.providerCode != null || order.costPrice != null;
  const margin =
    order.costPrice != null && order.costPrice > 0
      ? Math.round((order.price - order.costPrice) * 100) / 100
      : null;

  // What this order can still have done to it.
  //
  // Refunding is no longer queued-only, which was the bug: a failed order
  // offered a different button that moved no money at all, and an order left
  // on "paid" by a dispatch that did not complete offered nothing whatsoever.
  // It is still not offered on "processing" — the provider has started work
  // and will not cancel, so the refund would be a promise nobody can keep.
  // Refresh the status instead; a failure can be refunded the moment it is
  // reported.
  const canCancel = canRefundOrder(order.status);
  // Re-crediting needs a bundle that is paid for and not with the provider.
  const canRecredit = canRecreditOrder(order.status, order.paymentStatus);
  const canReport = order.status === "completed" && Boolean(whatsapp) && Boolean(onReport);
  // Awaiting payment, and the console that opened this can do something about
  // it. The agent side passes no admin forms, so it never sees this.
  const canSettle =
    order.paymentStatus !== "paid" &&
    order.status === "pending" &&
    Boolean(adminForms?.recheckPayment || adminForms?.settlePayment);
  // One button for the provider now. It refuses an order that is still with
  // them, so it is offered only where there is nothing in flight to disturb.
  const canReorder =
    Boolean(adminForms?.reorder) &&
    canReorderOrder(order.status, order.paymentStatus, Boolean(order.providerOrderId));
  const canRefresh = Boolean(adminForms?.refresh) && Boolean(order.providerOrderId);

  const caption = `${bundleLabel(order.sizeGb)} ${networkLabel(order.network)} · ${order.reference}`;

  if (view === "cancel") {
    return (
      <Shell
        title="Cancel & refund"
        caption={caption}
        onClose={onClose}
        onBack={() => setView("details")}
      >
        <CancelPanel
          order={order}
          admin={admin}
          onDone={(feedback) => {
            setDone(feedback);
            setView("done");
          }}
        />
      </Shell>
    );
  }

  if (view === "recredit") {
    return (
      <Shell
        title="Credit another number"
        caption={caption}
        onClose={onClose}
        onBack={() => setView("details")}
      >
        <RecreditPanel
          order={order}
          onDone={(feedback) => {
            setDone(feedback);
            setView("done");
          }}
        />
      </Shell>
    );
  }

  if (view === "reorder" && adminForms?.reorder) {
    return (
      <Shell
        title="Re-order"
        caption={caption}
        onClose={onClose}
        onBack={() => setView("details")}
      >
        <ReorderPanel
          order={order}
          reorder={adminForms.reorder}
          onDone={(feedback) => {
            setDone(feedback);
            setView("done");
          }}
        />
      </Shell>
    );
  }

  if (view === "done" && done) {
    return (
      <Shell
        title={done.title}
        caption={caption}
        onClose={onClose}
        footer={
          <button type="button" onClick={onClose} className={darkBtn}>
            Done
          </button>
        }
      >
        <div className="animate-scale-in rounded-2xl bg-niki-success/[0.08] p-6 text-center ring-1 ring-niki-success/25">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-success/15 text-niki-success">
            <Check className="h-6 w-6" />
          </span>
          <p className="mt-3 font-display font-bold text-niki-ink">{done.title}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-niki-ink/65">
            {done.message}
          </p>
          <p className="mt-3 font-mono text-[11px] text-niki-ink/40">{order.reference}</p>
        </div>
      </Shell>
    );
  }

  const hasActions = canReorder || canRefresh || canRecredit || canCancel || canReport;

  return (
    <Shell
      title="Order Details"
      caption={caption}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className={darkBtn}>
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
          {order.originalRecipientPhone ? (
            <DetailRow
              label="Bought for"
              value={
                <span className="font-mono text-niki-ink/55 line-through">
                  {order.originalRecipientPhone}
                </span>
              }
            />
          ) : null}
          <DetailRow label="Network" value={networkLabel(order.network)} />
          <DetailRow label="Size" value={bundleLabel(order.sizeGb)} />
          <DetailRow label="Source" value={order.sourceLabel} />
        </Panel>

        {showsTrade ? (
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

        {/* Only on an order that is waiting for money. Everything above
            describes the order; this is the one thing that can still change
            what happens to it. */}
        {canSettle ? (
          <SettlementPanel order={order} forms={adminForms!} onSettled={onClose} />
        ) : null}

        {hasActions ? (
          <div className="rounded-2xl bg-white p-2 ring-1 ring-niki-edge">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
              Actions
            </p>
            <div className="divide-y divide-niki-edge/70">
              {canReorder ? (
                <ActionRow
                  icon={RotateCcw}
                  label="Re-order"
                  caption="Buy this bundle from the provider again"
                  tone="primary"
                  onClick={() => setView("reorder")}
                />
              ) : null}

              {canRefresh ? (
                <ActionRow
                  icon={RefreshCw}
                  label="Refresh status"
                  caption="Ask the provider where this order got to"
                  busy={refreshing}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", order.id);
                    startRefresh(async () => {
                      await adminForms!.refresh!(fd);
                    });
                  }}
                />
              ) : null}

              {canRecredit ? (
                <ActionRow
                  icon={ArrowRightLeft}
                  label="Credit another number"
                  caption="Cancel this attempt and send it elsewhere"
                  onClick={() => setView("recredit")}
                />
              ) : null}

              {canCancel ? (
                <ActionRow
                  icon={Undo2}
                  label={order.paymentStatus === "paid" ? "Cancel & refund" : "Cancel order"}
                  caption={
                    order.paymentStatus === "paid"
                      ? `Put ${formatMoney(order.price)} back`
                      : "Nothing was charged for it"
                  }
                  tone="danger"
                  onClick={() => setView("cancel")}
                />
              ) : null}

              {canReport ? (
                <ActionRow
                  icon={MessageCircle}
                  label="Report not received"
                  caption="Open WhatsApp with this order's details"
                  onClick={onReport!}
                />
              ) : null}
            </div>
          </div>
        ) : null}
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
            className="niki-press inline-flex items-center gap-2 rounded-full bg-niki-success px-5 py-2.5 text-sm font-semibold text-white"
          >
            <MessageCircle className="h-4 w-4" />
            Open WhatsApp
          </a>
        </>
      }
    >
      <Prompt icon={MessageCircle} tone="trust" title="Report this order as not received?">
        This opens WhatsApp with the order details so our complaint team can review it.
      </Prompt>

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
 * else. Everything that can be *done* to an order — re-order, credit another
 * number, cancel and refund, report a delivery that never arrived — lives
 * inside the sheet the eye opens, where there is room to say what each one
 * means. A row of five icons cannot.
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
