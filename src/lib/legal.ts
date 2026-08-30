import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The policies Nickimart publishes, and the one place they're defined.
 *
 * These used to be a constant in the page that rendered them, which meant the
 * only way to correct a policy was a code change and a deploy — no good for a
 * document people are asked to agree to before they can register. They live in
 * the database now, and what's below is the starting text: a policy that has
 * never been edited falls back to it, so the pages read correctly on a database
 * that hasn't been touched yet and on one that hasn't been migrated at all.
 */

export interface PolicySection {
  heading: string;
  body: string;
}

export interface Policy {
  slug: string;
  title: string;
  intro: string;
  sections: PolicySection[];
  /** When an admin last saved it. Null while it is still the built-in text. */
  updatedAt: Date | null;
}

/**
 * Bodies are stored as one block of text, with `## ` marking each heading.
 * A textarea is what an admin actually wants to edit a policy in — a section
 * builder would turn a five-minute wording fix into a form-filling exercise.
 */
export function parseSections(body: string): PolicySection[] {
  const sections: PolicySection[] = [];
  let current: PolicySection | null = null;

  for (const rawLine of body.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1].trim(), body: "" };
      continue;
    }
    if (!current) {
      // Text before any heading still has to appear somewhere.
      if (!line) continue;
      current = { heading: "", body: "" };
    }
    current.body = current.body ? `${current.body}${line ? ` ${line}` : "\n\n"}` : line;
  }
  if (current) sections.push(current);

  return sections
    .map((s) => ({ heading: s.heading, body: s.body.trim() }))
    .filter((s) => s.heading || s.body);
}

/** The inverse, for seeding the editor from the built-in text. */
export function toBody(sections: PolicySection[]): string {
  return sections.map((s) => `## ${s.heading}\n${s.body}`).join("\n\n");
}

interface PolicyDefault {
  title: string;
  intro: string;
  sections: PolicySection[];
}

export const POLICY_DEFAULTS: Record<string, PolicyDefault> = {
  terms: {
    title: "Terms & Conditions",
    intro: "These terms govern your use of Nickimart as a buyer, seller, or data agent.",
    sections: [
      { heading: "Using Nickimart", body: "By accessing Nickimart you agree to use the platform lawfully and to provide accurate information when creating an account, listing products, or placing orders." },
      { heading: "Your account", body: "You are responsible for keeping your password private and for everything done through your account. Tell us immediately if you believe someone else has access to it." },
      { heading: "Orders & payments", body: "Prices are shown in Ghana Cedis (GH₵). Placing an order is an offer to buy, which is accepted once the seller confirms. Payment is processed through our supported providers." },
      { heading: "Data bundles", body: "Data bundles are delivered to the exact number entered at checkout. Data sent to a wrong but valid number cannot be reversed, so check the number before paying." },
      { heading: "Prohibited items", body: "Nickimart restricts dangerous, illegal, and age-restricted products including weapons, alcohol, nicotine, drugs, gambling, adult content, counterfeit goods, and prescription medicine." },
      { heading: "Suspension", body: "We may suspend or close an account that breaks these terms, and may withhold amounts owed where we reasonably suspect fraud." },
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "How Nickimart collects, uses, and protects your personal information.",
    sections: [
      { heading: "What we collect", body: "We collect information you provide (such as your name, contact details, and delivery address) and information about how you use Nickimart." },
      { heading: "How we use it", body: "We use your information to process orders, provide delivery and pickup, prevent fraud, and improve the platform." },
      { heading: "Who we share it with", body: "We share only what is needed to complete your order — with the seller, the payment provider, and the delivery or data provider handling it. We do not sell your data." },
      { heading: "Your choices", body: "You can request access to or deletion of your personal data. Contact our support team for any privacy request." },
    ],
  },
  returns: {
    title: "Return & Refund Policy",
    intro: "When and how you can return an item or request a refund.",
    sections: [
      { heading: "Eligibility", body: "Items may be returned if they arrive damaged, defective, or not as described, within the return window shown at checkout." },
      { heading: "Refunds", body: "Approved refunds are issued to your original payment method or Mobile Money wallet after the returned item is received and inspected." },
      { heading: "Data bundles", body: "A bundle that fails to deliver is refunded in full. A bundle delivered to the number you entered is not refundable, since the data cannot be recovered." },
      { heading: "Shipped-from-abroad deposits", body: "Where a seller takes a deposit on an item shipped from abroad, it is refundable under the refund terms stated on that listing, which you accept at checkout." },
    ],
  },
  "seller-policy": {
    title: "Seller Policy",
    intro: "The standards every Nickimart seller agrees to uphold.",
    sections: [
      { heading: "Accurate listings", body: "Sellers must describe products truthfully, use honest images, and keep pricing and stock up to date." },
      { heading: "Fulfilment", body: "Sellers must fulfil confirmed orders promptly and honour the delivery or pickup options they offer." },
      { heading: "Verification", body: "Sellers may be asked to complete verification (KYC). Verified sellers earn a trust badge on their shop." },
      { heading: "Commission & settlement", body: "Nickimart deducts a platform commission from each sale. The balance is settled to the payout details on your seller account." },
    ],
  },
  "agent-policy": {
    title: "Data Agent Policy",
    intro: "The terms every Nickimart data agent trades under.",
    sections: [
      { heading: "Your storefront", body: "An approved agent gets a storefront at a Nickimart address. It carries Nickimart's name, so it must be used honestly and may be closed if it is not." },
      { heading: "Setup fee", body: "Opening a storefront is charged to your balance rather than paid up front. The balance starts negative and clears itself from the commission you earn." },
      { heading: "Pricing", body: "You set what you charge above your agent price. You may not sell below your agent price, and you are responsible for what you tell your own customers." },
      { heading: "Commission", body: "Commission is the difference between your price and your agent price, credited to your balance once a bundle is delivered. An order that fails earns nothing." },
      { heading: "Withdrawals", body: "Commission is withdrawn to Mobile Money, less the withdrawal fee shown on your wallet. Requests are reviewed before they are sent." },
      { heading: "No stock, no float", body: "You never fund an account in advance. Your customer pays at checkout and Nickimart buys the bundle from that payment." },
    ],
  },
  // The slug is unchanged so existing links and any edited copy in the database
  // survive; the document itself now describes the shipped-from-abroad system
  // that replaced preorders.
  "preorder-policy": {
    title: "Shipped from Abroad Policy",
    intro: "How ordering, freight, duty, and balances work on items shipped from abroad.",
    sections: [
      { heading: "What you are ordering", body: "The seller sources the item from a supplier abroad once you order it. Nothing closes — you can order at any time — and the estimated arrival is shown on each listing." },
      { heading: "The three freight legs", body: "Your item travels from the supplier to a freight forwarder abroad, from there to a Ghana arrival point by air or sea, and finally from that point to your pickup station. Each leg is priced separately at checkout." },
      { heading: "Duty and taxes", body: "Sales tax charged in the country of purchase, Ghana import duty on the landed value, and Ghana VAT and levies are all itemised in your bill before you pay. Where a seller's price already includes freight into Ghana, that is stated on the listing and not charged again." },
      { heading: "Paying now or on arrival", body: "Where the seller allows it, you may pay for the goods, the tax at source and the first freight leg today, and settle the freight into Ghana, duty, Ghana tax and local delivery when the item lands. Those are quoted at today's rates but charged at the rates in force on arrival, so they may change. Paying in full locks them." },
      { heading: "Deposits", body: "Some listings take a deposit rather than the full item price at checkout. The amount and how the balance is paid are shown on the listing and again at checkout." },
      { heading: "Arrival and collection", body: "You are alerted when your order is placed with the supplier, when it lands in Ghana, and when it is ready to collect. Any balance falls due on arrival, before collection." },
      { heading: "Cancellations and refunds", body: "Each seller states their own refund terms on the listing, including what happens if the item is late or never arrives. Read them before ordering — they are shown again at checkout and you accept them there." },
    ],
  },
  "delivery-policy": {
    title: "Delivery Policy",
    intro: "Delivery, campus drop-off, and pickup options on Nickimart.",
    sections: [
      { heading: "Options", body: "Depending on the seller, you may choose same-day delivery, campus drop-off, or in-person pickup at an agreed location." },
      { heading: "Fees & timing", body: "Delivery fees and estimated timing are shown at checkout based on your location and the seller's options." },
      { heading: "Pickup", body: "For pickup orders, you'll receive details for collecting your item once the seller confirms it's ready." },
    ],
  },
};

export const POLICY_SLUGS = Object.keys(POLICY_DEFAULTS);

/** The slug of the document registration asks people to accept. */
export const TERMS_SLUG = "terms";

function fromDefault(slug: string): Policy | null {
  const d = POLICY_DEFAULTS[slug];
  if (!d) return null;
  return { slug, title: d.title, intro: d.intro, sections: d.sections, updatedAt: null };
}

/** One policy, as edited if it has been, as written here if it hasn't. */
export async function getPolicy(slug: string): Promise<Policy | null> {
  if (!POLICY_DEFAULTS[slug]) return null;
  try {
    const row = await prisma.legalPolicy.findUnique({ where: { slug } });
    if (!row) return fromDefault(slug);
    return {
      slug,
      title: row.title,
      intro: row.intro,
      sections: parseSections(row.body),
      updatedAt: row.updatedAt,
    };
  } catch {
    // Not migrated — the built-in text still publishes.
    return fromDefault(slug);
  }
}

/** Every policy, for the admin editor. */
export async function getAllPolicies(): Promise<Policy[]> {
  let rows: { slug: string; title: string; intro: string; body: string; updatedAt: Date }[] = [];
  try {
    rows = await prisma.legalPolicy.findMany();
  } catch {
    // Not migrated — everything shows its built-in text.
  }
  const edited = new Map(rows.map((r) => [r.slug, r]));

  return POLICY_SLUGS.map((slug) => {
    const row = edited.get(slug);
    const d = POLICY_DEFAULTS[slug];
    if (!row) return { slug, title: d.title, intro: d.intro, sections: d.sections, updatedAt: null };
    return {
      slug,
      title: row.title,
      intro: row.intro,
      sections: parseSections(row.body),
      updatedAt: row.updatedAt,
    };
  });
}

/** The editable text of one policy: what an admin sees in the textarea. */
export async function getPolicyDraft(
  slug: string,
): Promise<{ title: string; intro: string; body: string } | null> {
  const d = POLICY_DEFAULTS[slug];
  if (!d) return null;
  try {
    const row = await prisma.legalPolicy.findUnique({ where: { slug } });
    if (row) return { title: row.title, intro: row.intro, body: row.body };
  } catch {
    // Not migrated — fall through to the built-in text.
  }
  return { title: d.title, intro: d.intro, body: toBody(d.sections) };
}
