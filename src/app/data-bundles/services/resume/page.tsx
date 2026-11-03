import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ServiceContinuePanel } from "@/components/data/ServiceContinuePanel";

export const metadata: Metadata = { title: "Continue your application — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The page a "pick up where you left off" link points at.
 *
 * The same panel that sits under the services grid, on its own, for somebody
 * arriving from a message rather than from the store. It finds both a form
 * saved halfway and an order already paid for whose documents are still to
 * come, because those are the same thing to the person looking for them.
 */
export default function ServiceResumePage() {
  return (
    <>
      <PageHeader
        title="Continue your application"
        subtitle="Pick up a saved form, or add documents to something you have already paid for."
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "Continue" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-xl">
          <ServiceContinuePanel
            defaultOpen
            heading="Find your application"
            blurb="Your saved code, your order reference, or the phone number or email you used."
          />

          <p className="mt-5 text-xs leading-relaxed text-niki-ink/45">
            Saved forms are kept for 30 days. Looking for a data bundle instead? Use the{" "}
            <Link
              href="/data-bundles/orders"
              className="font-semibold text-niki-orange hover:underline"
            >
              order tracker
            </Link>
            .
          </p>
        </div>
      </Container>
    </>
  );
}
