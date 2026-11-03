import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { ServiceResumeForm } from "@/components/data/ServiceResumeForm";

export const metadata: Metadata = { title: "Continue your application — Nickimart" };
export const dynamic = "force-dynamic";

export default function ServiceResumePage() {
  return (
    <>
      <PageHeader
        title="Continue your application"
        subtitle="Enter the code you were given when you saved it."
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "Continue" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
          <ServiceResumeForm />
          <p className="mt-5 text-xs leading-relaxed text-niki-ink/45">
            Saved applications are kept for 30 days. Already paid for one? Look it up on the{" "}
            <Link href="/data-bundles/orders" className="font-semibold text-niki-orange hover:underline">
              order tracker
            </Link>{" "}
            with your reference instead.
          </p>
        </div>
      </Container>
    </>
  );
}
