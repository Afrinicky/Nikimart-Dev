import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageForm } from "@/components/admin/PageForm";

export const metadata: Metadata = { title: "New page — Admin — NikiMart" };

export default function NewPagePage() {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/pages" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to pages
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New page</h1>
      <p className="mt-1 text-sm text-niki-ink/60">Create a blank page, then add section blocks to it.</p>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <PageForm />
      </div>
    </Container>
  );
}
