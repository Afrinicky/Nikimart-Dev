import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { UserForm } from "@/components/admin/UserForm";
import { prisma } from "@/lib/prisma";
import { clearUserTwoFactor, updateUser } from "@/lib/admin-actions";
import { isRole, type Role } from "@/lib/roles";

export const metadata: Metadata = { title: "Edit user — Admin — Nickimart" };

type Params = Promise<{ id: string }>;

export default async function EditUserPage({ params }: { params: Params }) {
  const { id } = await params;
  const row = await prisma.user.findUnique({ where: { id } });
  if (!row) notFound();

  const action = updateUser.bind(null, id);
  const clearTwoFactor = clearUserTwoFactor.bind(null, id);
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
      <div className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-niki-edge">
        <UserForm action={action} user={user} submitLabel="Save changes" />
      </div>

      {/* The way back in for a lost phone or an abandoned inbox. Only ever off:
          turning it on means proving a code can be received, which is not
          something anybody can prove on another person's behalf. */}
      {row.twoFactorEnabled ? (
        <form
          action={clearTwoFactor}
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 ring-1 ring-niki-edge"
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-niki-success" />
            <div>
              <p className="font-semibold text-niki-ink">Two-step verification is on</p>
              <p className="mt-0.5 text-sm text-niki-ink/60">
                A code is sent by {row.twoFactorChannel === "sms" ? "text message" : "email"} at
                sign-in. Switch it off if they have lost access to it.
              </p>
            </div>
          </div>
          <button
            type="submit"
            className="niki-press shrink-0 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-niki-danger ring-1 ring-niki-danger/30 hover:bg-niki-danger/5"
          >
            Turn off
          </button>
        </form>
      ) : null}
    </Container>
  );
}
