import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { BannerForm } from "@/components/admin/BannerForm";
import { createBanner } from "@/lib/banner-actions";

export const metadata: Metadata = { title: "New banner — Admin — NikiMart" };

export default function NewBannerPage() {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/banners" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to carousel
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New banner</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <BannerForm action={createBanner} submitLabel="Create banner" />
      </div>
    </Container>
  );
}
