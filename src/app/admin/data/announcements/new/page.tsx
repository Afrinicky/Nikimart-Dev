import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { AnnouncementComposer } from "@/components/admin/AnnouncementComposer";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "New announcement — Admin — Nickimart" };
export const dynamic = "force-dynamic";

export default async function NewDataAnnouncementPage() {
  await requireAdmin();
  return (
    <Container className="py-8">
      <ActionLink
        href="/admin/data/announcements"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-niki-ink/60 hover:text-niki-orange"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to announcements
      </ActionLink>
      <div className="mt-4 max-w-2xl">
        <AnnouncementComposer scope="data" />
      </div>
    </Container>
  );
}
