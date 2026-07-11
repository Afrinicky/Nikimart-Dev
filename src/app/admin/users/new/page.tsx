import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { UserForm } from "@/components/admin/UserForm";
import { createUser } from "@/lib/admin-actions";

export const metadata: Metadata = { title: "New user — Admin — NikiMart" };

export default function NewUserPage() {
  return (
    <Container className="max-w-2xl py-8">
      <Link href="/admin/users" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to users
      </Link>
      <h1 className="mt-3 font-display text-2xl font-bold text-niki-ink">New user</h1>
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <UserForm action={createUser} submitLabel="Create user" />
      </div>
    </Container>
  );
}
