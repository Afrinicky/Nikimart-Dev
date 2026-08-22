"use client";

import { useState } from "react";
import { Check, Clock3, FileText, Headphones, HelpCircle, MessageCircle, Phone, Send } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { BusyButton } from "@/components/ui/motion";
import { cn } from "@/lib/cn";
import { requestCallback } from "@/lib/data-bundles/agent-actions";

const LANGUAGES = ["English", "Twi", "Ga", "Ewe", "Hausa", "Dagbani"];

const FAQ = [
  {
    q: "When is my commission paid?",
    a: "The moment a bundle is delivered. A sale that is paid but not yet delivered shows as pending on your wallet, and becomes yours as soon as the data lands. An order that fails never charges you and never pays you.",
  },
  {
    q: "Why is my balance negative?",
    a: "Opening a storefront costs a setup fee, and it is charged as a debit rather than asked for up front. Your commissions pay it off automatically; once the balance passes zero everything above it is yours to withdraw.",
  },
  {
    q: "How do I set my prices?",
    a: "Store → Pricing. Each row shows what NikiMart charges you and what you charge; the difference is what you earn. Use “Price all” to apply one markup across the whole ladder in a single go.",
  },
  {
    q: "Do I need to stock my account?",
    a: "No. Your customers pay through Paystack at the moment they buy, and NikiMart buys the bundle from that payment. There is nothing to fund and nothing to run out of.",
  },
  {
    q: "How long do withdrawals take?",
    a: "They are sent to MoMo by hand, usually the same day. The amount leaves your balance when you request it and comes straight back if the request is rejected.",
  },
  {
    q: "A customer's data hasn't arrived. What do I do?",
    a: "Check the order under Orders — the status there is live. If it says failed, NikiMart support is already on it and the customer will be credited or refunded. Anything else, request a callback below.",
  },
];

const TABS = [
  { value: "callback", label: "Request Callback", icon: Clock3 },
  { value: "contact", label: "Contact Us", icon: Headphones },
  { value: "faq", label: "FAQ", icon: HelpCircle },
  { value: "terms", label: "Terms", icon: FileText },
] as const;

/**
 * The agent Support screen. Local tab state rather than the URL — nothing here
 * is worth a shareable link, and switching should be instant.
 */
export function SupportTabs({
  defaultName,
  defaultPhone,
  supportPhone,
  supportWhatsapp,
  whatsappGroup,
  setupFee,
  withdrawalFee,
  minWithdrawal,
}: {
  defaultName: string;
  defaultPhone: string;
  supportPhone: string;
  supportWhatsapp: string;
  whatsappGroup: string;
  setupFee: number;
  withdrawalFee: number;
  minWithdrawal: number;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["value"]>("callback");

  return (
    <div className="space-y-5">
      <div className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto border-b border-black/5 px-1">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            aria-current={tab === value ? "page" : undefined}
            className={cn(
              "niki-press niki-focus flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold",
              tab === value
                ? "border-niki-orange text-niki-orange"
                : "border-transparent text-niki-ink/55 hover:text-niki-ink",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div key={tab} className="animate-fade-up">
        {tab === "callback" ? (
          <CallbackForm defaultName={defaultName} defaultPhone={defaultPhone} />
        ) : null}
        {tab === "contact" ? (
          <ContactPanel
            supportPhone={supportPhone}
            supportWhatsapp={supportWhatsapp}
            whatsappGroup={whatsappGroup}
          />
        ) : null}
        {tab === "faq" ? <FaqPanel /> : null}
        {tab === "terms" ? (
          <TermsPanel
            setupFee={setupFee}
            withdrawalFee={withdrawalFee}
            minWithdrawal={minWithdrawal}
          />
        ) : null}
      </div>
    </div>
  );
}

function CallbackForm({ defaultName, defaultPhone }: { defaultName: string; defaultPhone: string }) {
  const [fullName, setFullName] = useState(defaultName);
  const [phone, setPhone] = useState(defaultPhone);
  const [language, setLanguage] = useState("English");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const result = await requestCallback({ fullName, phone, language, message });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDone(result.message ?? "We'll call you back shortly.");
    setMessage("");
  }

  if (done) {
    return (
      <div className="animate-scale-in rounded-2xl bg-niki-success/10 p-6 text-center ring-1 ring-niki-success/30">
        <Check className="mx-auto h-8 w-8 text-niki-success" />
        <p className="mt-2 font-display font-bold text-niki-ink">Callback requested</p>
        <p className="mt-1 text-sm text-niki-ink/70">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-5 ring-1 ring-black/5" noValidate>
      <p className="font-display font-bold text-niki-ink">Request a callback</p>

      {error ? (
        <p className="animate-fade-up rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Full name <span className="text-niki-danger">*</span>
          </span>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Enter your full name"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-niki-ink">
            Phone number <span className="text-niki-danger">*</span>
          </span>
          <input
            inputMode="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0241234567"
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">Preferred language</span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className={inputClass}
        >
          {LANGUAGES.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-niki-ink">
          What do you need help with? <span className="text-niki-danger">*</span>
        </span>
        <textarea
          required
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Describe the problem — include an order reference if there is one."
          className={`${inputClass} resize-y`}
        />
      </label>

      <BusyButton
        type="submit"
        busy={pending}
        pendingLabel="Sending…"
        icon={<Send className="h-4 w-4" />}
        className="rounded-xl bg-niki-orange px-6 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        Request callback
      </BusyButton>
    </form>
  );
}

function ContactPanel({
  supportPhone,
  supportWhatsapp,
  whatsappGroup,
}: {
  supportPhone: string;
  supportWhatsapp: string;
  whatsappGroup: string;
}) {
  const cards = [
    supportPhone
      ? {
          icon: Phone,
          title: "Phone support",
          body: supportPhone,
          href: `tel:${supportPhone.replace(/\s/g, "")}`,
          cta: "Call now",
        }
      : null,
    supportWhatsapp
      ? {
          icon: MessageCircle,
          title: "WhatsApp support",
          body: supportWhatsapp,
          href: `https://wa.me/${supportWhatsapp.replace(/\D/g, "").replace(/^0/, "233")}`,
          cta: "Open WhatsApp",
        }
      : null,
    whatsappGroup
      ? {
          icon: MessageCircle,
          title: "Agent group",
          body: "Announcements and help from other agents",
          href: whatsappGroup,
          cta: "Join group",
        }
      : null,
  ].filter(Boolean) as Array<{
    icon: React.ElementType;
    title: string;
    body: string;
    href: string;
    cta: string;
  }>;

  if (cards.length === 0) {
    return (
      <p className="rounded-2xl bg-niki-surface px-4 py-10 text-center text-sm text-niki-ink/55">
        Support contacts haven&apos;t been published yet. Use Request Callback and we&apos;ll come
        to you.
      </p>
    );
  }

  return (
    <div className="stagger-children grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((c) => (
        <div
          key={c.title}
          className="flex flex-col items-center rounded-2xl bg-white p-6 text-center ring-1 ring-black/5"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-ghana/10 text-niki-ghana">
            <c.icon className="h-5 w-5" />
          </span>
          <p className="mt-3 font-display font-bold text-niki-ink">{c.title}</p>
          <p className="mt-1 text-sm text-niki-ink/60">{c.body}</p>
          <a
            href={c.href}
            target={c.href.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="niki-press mt-4 w-full rounded-xl bg-niki-surface px-4 py-2.5 text-sm font-semibold text-niki-ink/75 hover:bg-niki-navy/5"
          >
            {c.cta}
          </a>
        </div>
      ))}
    </div>
  );
}

function FaqPanel() {
  return (
    <div className="stagger-children space-y-2">
      {FAQ.map((f) => (
        <details
          key={f.q}
          className="group rounded-2xl bg-white px-5 py-4 ring-1 ring-black/5 transition-shadow open:shadow-md"
        >
          <summary className="niki-focus flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-niki-ink">
            {f.q}
            <span className="text-niki-ink/30 transition-transform group-open:rotate-45">+</span>
          </summary>
          <p className="animate-fade-up mt-3 text-sm leading-relaxed text-niki-ink/65">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

function TermsPanel({
  setupFee,
  withdrawalFee,
  minWithdrawal,
}: {
  setupFee: number;
  withdrawalFee: number;
  minWithdrawal: number;
}) {
  const terms = [
    `Opening a storefront costs GH₵${setupFee.toFixed(2)}, charged as a debit against your balance. It is settled out of the commission you earn — there is nothing to pay separately.`,
    "You set your own retail prices, and they must be at or above the agent price NikiMart charges you. Your commission is the difference.",
    "Commission is credited only once a bundle has been delivered. Orders that fail earn nothing and cost you nothing.",
    `Withdrawals are paid to MoMo. The minimum is GH₵${minWithdrawal.toFixed(2)}${withdrawalFee > 0 ? `, and a flat GH₵${withdrawalFee.toFixed(2)} fee is deducted with each payout` : ""}.`,
    "Data is credited to the exact number entered at checkout. Bundles sent to a wrong number cannot be reversed — check every number before paying.",
    "Accounts used for fraud, chargebacks, or misrepresenting NikiMart may be suspended. A suspended account keeps its balance and history but stops selling and stops earning.",
    "NikiMart may change agent prices with notice. Your own prices are never changed for you, but a price below your new cost stops selling until you raise it.",
  ];

  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
      <p className="font-display font-bold text-niki-ink">Agent terms</p>
      <ol className="mt-3 space-y-3">
        {terms.map((t, i) => (
          <li key={t} className="flex gap-3 text-sm leading-relaxed text-niki-ink/70">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-niki-surface text-xs font-bold text-niki-ink/45">
              {i + 1}
            </span>
            {t}
          </li>
        ))}
      </ol>
    </div>
  );
}
