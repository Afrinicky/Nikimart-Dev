import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { AfaForm } from "@/components/data/AfaForm";
import { getDataStoreConfig } from "@/lib/settings";

export const metadata: Metadata = { title: "AFA Registration — Nickimart Data" };
export const dynamic = "force-dynamic";

export default async function AfaPage() {
  const config = await getDataStoreConfig();
  if (!config.enabled || !config.afaEnabled) notFound();

  return (
    <>
      <PageHeader
        title="AFA registration"
        subtitle="Register a number for AFA to unlock agent bundle rates. Fill in the details exactly as they appear on the Ghana Card."
        crumbs={[{ label: "Data bundles", href: "/data-bundles" }, { label: "AFA registration" }]}
        tone="dark"
      />

      <Container className="py-8">
        <div className="mx-auto max-w-2xl rounded-3xl bg-white p-6 ring-1 ring-niki-edge sm:p-8">
          <AfaForm price={config.afaPrice} />
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-niki-ink/40">
          Registrations are reviewed by the network before approval. Details that don&apos;t match the
          Ghana Card are rejected, so please check them before paying.
        </p>
      </Container>
    </>
  );
}
