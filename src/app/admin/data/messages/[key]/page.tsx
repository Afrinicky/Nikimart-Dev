import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { ActionLink } from "@/components/ui/motion";
import { MessageEditor } from "@/components/admin/MessageEditor";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { getTemplateView } from "@/lib/messages";

export const metadata: Metadata = { title: "Message — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function AdminDataMessagePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const template = await getTemplateView(decodeURIComponent(key));
  if (!template || template.scope !== "data") notFound();

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Announcements"
        subtitle="What Nickimart says to people: on their screen, when something happens, and on purpose."
        icon={Megaphone}
      />
      <div className="mt-5">
        <ModuleTabs tabs={ANNOUNCEMENT_MODULE_TABS("data")} />
      </div>

      <ActionLink
        href="/admin/data/messages"
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
