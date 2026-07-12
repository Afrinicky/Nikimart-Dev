import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { prisma } from "@/lib/prisma";
import { deleteFaq } from "@/lib/settings-actions";

export const metadata: Metadata = { title: "FAQs — Admin — NikiMart" };

export default async function AdminFaqsPage() {
  const faqs = await prisma.faq.findMany({ orderBy: { order: "asc" } });

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">FAQs</h1>
          <p className="mt-1 text-sm text-niki-ink/60">Shown on the Help page. {faqs.length} entries.</p>
        </div>
        <Link
          href="/admin/faqs/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New FAQ
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        {faqs.map((f) => (
          <div key={f.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-black/5">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-niki-ink">{f.question}</p>
              <p className="mt-1 line-clamp-2 text-sm text-niki-ink/60">{f.answer}</p>
            </div>
            <div className="flex items-center gap-1">
              <Link href={`/admin/faqs/${f.id}`} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-navy/5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
              <DeleteButton id={f.id} action={deleteFaq} label="" title="Delete FAQ" />
            </div>
          </div>
        ))}
        {faqs.length === 0 ? (
          <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">
            No FAQs yet. The Help page shows built-in defaults until you add some.
          </p>
        ) : null}
      </div>
    </Container>
  );
}
