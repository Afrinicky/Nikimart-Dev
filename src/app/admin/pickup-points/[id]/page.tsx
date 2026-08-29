import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PickupPointForm } from "@/components/admin/PickupPointForm";
import { prisma } from "@/lib/prisma";
import { updatePickupPoint } from "@/lib/pickup-actions";

export const metadata: Metadata = { title: "Edit pickup point — Admin — Nickimart" };

type Params = Promise<{ id: string }>;

export default async function EditPickupPointPage({ params }: { params: Params }) {
  const { id } = await params;
  const point = await prisma.pickupPoint.findUnique({ where: { id } });
  if (!point) notFound();
  // Free operators, plus this point's current operator so it stays selectable.
  const operators = await prisma.user.findMany({
    where: {
      role: { in: ["PICKUP", "ADMIN"] },
      OR: [{ pickupPoint: { is: null } }, { id: point.operatorId ?? "__none__" }],
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });

  const action = updatePickupPoint.bind(null, id);

  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/pickup-points" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to pickup points
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {point.name}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <PickupPointForm action={action} point={point} operators={operators} currentOperatorId={point.operatorId} submitLabel="Save changes" />
      </div>
    </Container>
  );
}
