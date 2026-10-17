import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { MessengerHeader } from "@/components/admin/messenger/MessengerHeader";
import { ActionLink } from "@/components/ui/motion";
import { MessageEditor } from "@/components/admin/MessageEditor";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { countOpenComplaints } from "@/lib/retail/complaints";
import { getTemplateView } from "@/lib/messages";

export const metadata: Metadata = { title: "Message — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AdminRetailMessagePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const template = await getTemplateView(decodeURIComponent(key));
  if (!template || template.scope !== "retail") notFound();

  return (
    <Container className="py-8">
      <MessengerHeader scope="retail" tabs={ANNOUNCEMENT_MODULE_TABS("retail", 0, await countOpenComplaints())} />

      <ActionLink
        href="/admin/messages"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to messages
      </ActionLink>

      <div className="mt-4">
        <MessageEditor template={template} />
      </div>
    </Container>
  );
}
