import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";

type Params = Promise<{ slug: string }>;

const POLICIES: Record<string, { title: string; intro: string; sections: { heading: string; body: string }[] }> = {
  terms: {
    title: "Terms & Conditions",
    intro: "These terms govern your use of NikiMart as a buyer or seller.",
    sections: [
      { heading: "Using NikiMart", body: "By accessing NikiMart you agree to use the platform lawfully and to provide accurate information when creating an account, listing products, or placing orders." },
      { heading: "Orders & payments", body: "Prices are shown in Ghana Cedis (GH₵). Placing an order is an offer to buy, which is accepted once the seller confirms. Payment is processed through our supported providers." },
      { heading: "Prohibited items", body: "NikiMart restricts dangerous, illegal, and age-restricted products including weapons, alcohol, nicotine, drugs, gambling, adult content, counterfeit goods, and prescription medicine." },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "How NikiMart collects, uses, and protects your personal information.",
    sections: [
      { heading: "What we collect", body: "We collect information you provide (such as your name, contact details, and delivery address) and information about how you use NikiMart." },
      { heading: "How we use it", body: "We use your information to process orders, provide delivery and pickup, prevent fraud, and improve the platform." },
      { heading: "Your choices", body: "You can request access to or deletion of your personal data. Contact our support team for any privacy request." },
    ],
  },
  returns: {
    title: "Return & Refund Policy",
    intro: "When and how you can return an item or request a refund.",
    sections: [
      { heading: "Eligibility", body: "Items may be returned if they arrive damaged, defective, or not as described, within the return window shown at checkout." },
      { heading: "Refunds", body: "Approved refunds are issued to your original payment method or Mobile Money wallet after the returned item is received and inspected." },
      { heading: "Preorder deposits", body: "Preorder deposits are refundable if the order is cancelled before the seller's stated closing date." },
    ],
  },
  "seller-policy": {
    title: "Seller Policy",
    intro: "The standards every NikiMart seller agrees to uphold.",
    sections: [
      { heading: "Accurate listings", body: "Sellers must describe products truthfully, use honest images, and keep pricing and stock up to date." },
      { heading: "Fulfilment", body: "Sellers must fulfil confirmed orders promptly and honour the delivery or pickup options they offer." },
      { heading: "Verification", body: "Sellers may be asked to complete verification (KYC). Verified sellers earn a trust badge on their shop." },
    ],
  },
  "preorder-policy": {
    title: "Preorder Policy",
    intro: "How preorders, deposits, and balances work on NikiMart.",
    sections: [
      { heading: "Deposits", body: "Preorders require a deposit to reserve your item. The deposit amount is shown on each preorder product." },
      { heading: "Balance & arrival", body: "You settle the remaining balance on arrival, before delivery or pickup. Estimated arrival times are shown per product and may vary." },
      { heading: "Cancellations", body: "You may cancel and receive a full deposit refund before the seller's stated closing date." },
    ],
  },
  "delivery-policy": {
    title: "Delivery Policy",
    intro: "Delivery, campus drop-off, and pickup options on NikiMart.",
    sections: [
      { heading: "Options", body: "Depending on the seller, you may choose same-day delivery, campus drop-off, or in-person pickup at an agreed location." },
      { heading: "Fees & timing", body: "Delivery fees and estimated timing are shown at checkout based on your location and the seller's options." },
      { heading: "Pickup", body: "For pickup orders, you'll receive details for collecting your item once the seller confirms it's ready." },
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(POLICIES).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const policy = POLICIES[slug];
  return { title: policy ? `${policy.title} — NikiMart` : "Policy — NikiMart" };
}

export default async function LegalPage({ params }: { params: Params }) {
  const { slug } = await params;
  const policy = POLICIES[slug];
  if (!policy) notFound();

  return (
    <>
      <PageHeader
        title={policy.title}
        subtitle={policy.intro}
        crumbs={[{ label: "Legal" }, { label: policy.title }]}
      />
      <Container className="py-8">
        <div className="mx-auto max-w-3xl space-y-6">
          {policy.sections.map((s) => (
            <section key={s.heading} className="rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display text-lg font-bold text-niki-ink">{s.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-niki-ink/70">{s.body}</p>
            </section>
          ))}
          <p className="text-xs text-niki-ink/40">
            This is a summary for the NikiMart preview. Full legal terms will be published before
            launch.
          </p>
        </div>
      </Container>
    </>
  );
}
