import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { UserForm } from "@/components/admin/UserForm";
import { prisma } from "@/lib/prisma";
import { updateUser } from "@/lib/admin-actions";
import { isRole, type Role } from "@/lib/roles";

export const metadata: Metadata = { title: "Edit user — Admin — NikiMart" };

type Params = Promise<{ id: string }>;

export default async function EditUserPage({ params }: { params: Params }) {
  const { id } = await params;
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) notFound();

  const action = updateUser.bind(null, id);
  const user = {
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: (isRole(row.role) ? row.role : "CUSTOMER") as Role,
  };

  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/users" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">Edit {row.name ?? row.email}</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <UserForm action={action} user={user} submitLabel="Save changes" />
      </div>
    </Container>
  );
}
