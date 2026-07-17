import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { LocationForm } from "@/components/admin/LocationForm";
import { prisma } from "@/lib/prisma";
import { updateLocation } from "@/lib/location-actions";

export const metadata: Metadata = { title: "Edit location — Admin — NikiMart" };

type Params = Promise<{ id: string }>;

export default async function EditLocationPage({ params }: { params: Params }) {
  const { id } = await params;
  const location = await prisma.location.findUnique({ where: { id } });
  if (!location) notFound();

  const action = updateLocation.bind(null, id);

  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/locations" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to locations
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {location.name}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <LocationForm action={action} location={location} submitLabel="Save changes" />
      </div>
    </Container>
  );
}
