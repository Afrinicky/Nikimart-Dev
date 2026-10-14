import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, MessageCircle, Phone } from "lucide-react";
import { ModuleHeader, PanelHeading } from "@/components/admin/ModuleHeader";
import { requireAffiliateConsole } from "@/lib/affiliate-console";
import { getSettings } from "@/lib/settings";
import { waChatLink } from "@/lib/whatsapp";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Help — Affiliate — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * How the programme works, and who to ask when it doesn't.
 *
 * Written as the answers to the questions that actually get asked — when do I
 * get paid, why is this order not mine, what happens if it comes back — with
 * the live policy figures in them rather than a number somebody typed into a
 * help page once and never revisited.
 */
export default async function AffiliateSupportPage() {
  const { policy } = await requireAffiliateConsole();
  const settings = await getSettings();

  const whatsapp = policy.supportWhatsapp || settings.socialWhatsapp || settings.supportPhone;
  const chat = waChatLink(whatsapp, "Hello Nickimart — I have a question about the affiliate programme.");

  const faqs = [
    {
      q: "When do I get paid?",
      a: `Commission is held while an order is in flight, and clears ${
        policy.returnWindowDays > 0
          ? `${policy.returnWindowDays} day${policy.returnWindowDays === 1 ? "" : "s"} after the order is delivered`
          : "as soon as the order is delivered"
      } — once the buyer can no longer return it. Cleared commission shows as Available on your Earnings screen, and you can request a payout of ${formatMoney(policy.minPayout)} or more at any time.`,
    },
    {
      q: "How long does a referral last?",
      a: `${policy.attributionWindowDays} days from the moment somebody follows your link. Anything they buy in that window is credited to you, not only the product you shared. ${
        policy.attributionModel === "last"
          ? "If they later follow another affiliate's link, the most recent one wins — so does yours when you are the reason they came back."
          : "The first affiliate's link wins, so a later click by somebody else cannot take your referral."
      }`,
    },
    {
      q: "Why did an order not earn me anything?",
      a: "Usually one of four reasons: the product is not in the affiliate programme, the referral window had closed, the buyer was your own account, or your account was on hold at the time. Your Commissions screen names the reason against each order.",
    },
    {
      q: "What happens if the customer returns it?",
      a: "The commission is reversed, in proportion — a full refund takes all of it back, a partial refund takes its share. That is why commission waits for the return window instead of paying on delivery.",
    },
    {
      q: "Can I buy through my own link?",
      a: "No. Self-referrals are refused automatically, and repeated attempts are flagged for review. The programme pays for customers you bring, not for your own shopping.",
    },
    {
      q: "Who sets the commission on a product?",
      a: "The shop, or Nickimart. A shop can offer a rate out of its own margin; Nickimart can enrol a product and fund the commission out of its own cut. Either way the rate you see on a product is the rate you earn, and it is snapshotted when the sale happens — a later change cannot reduce what you have already made.",
    },
    {
      q: "Can I share a product that isn't in the programme?",
      a: "Yes, and the flyer still works — it just will not pay commission. The catalogue marks those rows plainly so you are never guessing.",
    },
  ];

  return (
    <div className="max-w-3xl">
      <ModuleHeader
        title="Help"
        subtitle="How the programme works, and how to reach us."
        icon={LifeBuoy}
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {chat ? (
          <a
            href={chat}
            target="_blank"
            rel="noopener"
            className="niki-press flex items-center gap-3 rounded-2xl bg-niki-success px-5 py-4 text-white"
          >
            <MessageCircle className="h-5 w-5 shrink-0" />
            <span>
              <span className="block text-sm font-bold">WhatsApp us</span>
              <span className="block text-xs text-white/80">Fastest way to get an answer</span>
            </span>
          </a>
        ) : null}
        {settings.supportPhone ? (
          <a
            href={`tel:${settings.supportPhone}`}
            className="niki-press flex items-center gap-3 rounded-2xl bg-white px-5 py-4 ring-1 ring-niki-edge"
          >
            <Phone className="h-5 w-5 shrink-0 text-niki-orange" />
            <span>
              <span className="block text-sm font-bold text-niki-ink">{settings.supportPhone}</span>
              <span className="block text-xs text-niki-ink/55">{settings.businessHours}</span>
            </span>
          </a>
        ) : null}
      </div>

      {policy.terms ? (
        <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
          <PanelHeading title="Programme terms" />
          <p className="whitespace-pre-line text-sm leading-relaxed text-niki-ink/70">
            {policy.terms}
          </p>
        </section>
      ) : null}

      <section className="mt-5 rounded-2xl bg-white p-5 ring-1 ring-niki-edge sm:p-6">
        <PanelHeading title="Common questions" />
        <dl className="divide-y divide-niki-edge">
          {faqs.map((faq) => (
            <div key={faq.q} className="py-4 first:pt-0 last:pb-0">
              <dt className="font-display text-sm font-bold text-niki-ink">{faq.q}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-niki-ink/65">{faq.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="mt-5 text-sm text-niki-ink/55">
        Looking for Nickimart&apos;s own policies? They&apos;re in{" "}
        <Link href="/legal" className="font-semibold text-niki-orange hover:underline">
          Legal
        </Link>
        .
      </p>
    </div>
  );
}
