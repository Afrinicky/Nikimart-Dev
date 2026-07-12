import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireDashboard } from "@/lib/session";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireDashboard("/admin");

  return (
    <>
      <div className="border-b border-black/5 bg-white">
        <Container className="py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-niki-navy text-niki-orange">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-lg font-bold text-niki-ink">Admin Console</p>
                <p className="text-xs text-niki-ink/60">{user.name ?? user.email}</p>
              </div>
            </div>
            <LogoutButton />
          </div>
          <div className="mt-4">
            <AdminNav />
          </div>
        </Container>
      </div>
      {children}
    </>
  );
}
