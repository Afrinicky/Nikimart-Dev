import Link from "next/link";
import type { Metadata } from "next";
import { LifeBuoy, Mail, MessageCircle, Phone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Help Centre — Nickimart",
};

const DEFAULT_FAQS = [
  {
    question: "How does delivery and pickup work?",
    answer:
      "Many sellers offer same-day delivery, campus drop-off, or in-person pickup. The available options are shown on each product page and at checkout.",
  },
  {
    question: "How does Shipped from Abroad work?",
    answer:
      "The seller sources the item from a supplier abroad once you order — ordering never closes. Your bill itemises the three freight legs, the tax at source, and Ghana duty and VAT, so you see every charge before paying. Where the seller allows it you can pay for the goods now and settle the freight and duty when it lands. You're alerted when it reaches Ghana and again when it's ready to collect.",
  },
  {
    question: "How do I pay?",
    answer:
      "Nickimart supports local payments including Mobile Money and card. Secure checkout is being rolled out — you'll choose your payment method at checkout.",
  },
  {
    question: "How do I become a seller?",
    answer:
      "Head to “Sell on Nickimart”, register your shop, complete quick verification, and start listing products, imported goods, or services.",
  },
];

async function getFaqs() {
  try {
    const rows = await prisma.faq.findMany({ orderBy: { order: "asc" } });
    if (rows.length) return rows.map((r) => ({ question: r.question, answer: r.answer }));
  } catch {
    // table not migrated yet
  }
  return DEFAULT_FAQS;
}

export default async function HelpPage() {
  const [settings, faqs] = await Promise.all([getSettings(), getFaqs()]);
  const contacts = [
    { icon: MessageCircle, title: "Live chat", desc: "Chat with our support team", value: settings.liveChatStatus },
    { icon: Mail, title: "Email us", desc: "We reply within 24 hours", value: settings.supportEmail },
    { icon: Phone, title: "Call us", desc: settings.businessHours, value: settings.supportPhone },
  ];
  return (
    <>
      <PageHeader
        title="Help Centre"
        subtitle="Answers to common questions, and ways to reach the Nickimart team."
        crumbs={[{ label: "Help" }]}
      />

      <Container className="py-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {contacts.map(({ icon: Icon, title, desc, value }) => (
            <div key={title} className="rounded-2xl bg-white p-5 ring-1 ring-niki-edge">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-niki-black text-niki-orange">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-semibold text-niki-ink">{title}</h3>
              <p className="text-sm text-niki-ink/60">{desc}</p>
              <p className="mt-1 text-sm font-medium text-niki-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-10">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold text-niki-ink">
            <LifeBuoy className="h-5 w-5 text-niki-orange" />
            Frequently asked questions
          </h2>
          <div className="mt-4 space-y-3">
            {faqs.map((f, i) => (
              <details
                key={i}
                className="group rounded-2xl bg-white p-5 ring-1 ring-niki-edge [&_summary]:cursor-pointer"
              >
                <summary className="flex items-center justify-between font-semibold text-niki-ink marker:content-['']">
                  {f.question}
                  <span className="ml-4 text-niki-orange transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-niki-ink/70">{f.answer}</p>
              </details>
            ))}
          </div>
        </div>

        <p className="mt-8 text-sm text-niki-ink/60">
          Still need help?{" "}
          <Link href="/help" className="font-semibold text-niki-orange hover:underline">
            Contact our team
          </Link>
          .
        </p>
      </Container>
    </>
  );
}
