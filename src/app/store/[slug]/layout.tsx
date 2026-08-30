import { notFound } from "next/navigation";
import { MessageCircle, Phone, Search, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { getAgentBySlug } from "@/lib/data-bundles/agents";

export const dynamic = "force-dynamic";

/**
 * The public shell for an agent's storefront.
 *
 * It carries the agent's own name and contacts rather than Nickimart's — their
 * customers are buying from them. Fulfilment, payment and delivery are still
 * Nickimart's, which the footer says plainly.
 */
export default async function StoreLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = await getAgentBySlug(slug);
  if (!agent) notFound();

  const wa = agent.supportWhatsapp
    ? `https://wa.me/${agent.supportWhatsapp.replace(/\D/g, "").replace(/^0/, "233")}`
    : null;

  return (
    <>
      <div className="niki-gradient-hero text-white">
        <Container className="py-8 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-niki-gold ring-1 ring-white/15">
                <Store className="h-6 w-6" />
              </span>
              <div>
                <h1 className="font-display text-2xl font-bold sm:text-3xl">{agent.storeName}</h1>
                <p className="mt-1 max-w-xl text-sm text-white/65">
                  {agent.storeTagline || "MTN, Telecel & AirtelTigo bundles — delivered in seconds."}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <ActionLink
                href={`/store/${agent.slug}/orders`}
                className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2.5 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/20"
              >
                <Search className="h-4 w-4" />
                Track order
              </ActionLink>
              {wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="niki-press flex items-center gap-2 rounded-full bg-niki-ghana px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              ) : null}
              {agent.supportPhone ? (
                <a
                  href={`tel:${agent.supportPhone}`}
                  className="niki-press flex items-center gap-2 rounded-full bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Phone className="h-4 w-4" />
                  Call
                </a>
              ) : null}
            </div>
          </div>
        </Container>
      </div>

      {children}

      <Container className="pb-10">
        <p className="text-center text-xs text-niki-ink/40">
          {agent.storeName} is an authorised Nickimart data agent. Payments are processed by Paystack
          and bundles are delivered by Nickimart.
        </p>
      </Container>
    </>
  );
}
