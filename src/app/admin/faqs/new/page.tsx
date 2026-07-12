import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { FaqForm } from "@/components/admin/FaqForm";
import { createFaq } from "@/lib/settings-actions";

export const metadata: Metadata = { title: "New FAQ — Admin — NikiMart" };

export default function NewFaqPage() {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/faqs" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to FAQs
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New FAQ</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <FaqForm action={createFaq} submitLabel="Create FAQ" />
      </div>
    </Container>
  );
}
