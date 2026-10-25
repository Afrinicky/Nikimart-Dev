import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MedicalAdminShell } from "@/components/medical/console/MedicalAdminShell";
import { medicalStaff } from "@/lib/medical/session";
import { isMedicalConfigured } from "@/lib/medical/db";
import { NotConfigured } from "@/components/medical/ui/NotConfigured";

export const metadata: Metadata = {
  title: { default: "Console", template: "%s · Nickimart Medical" },
  robots: { index: false, follow: false },
};

/**
 * Console pages read the signed-in staff member and the database on every
 * request, so none of them may be cached or prerendered.
 */
export const dynamic = "force-dynamic";

export default async function MedicalAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isMedicalConfigured()) return <NotConfigured />;

  // One check at the root of the tree for "is this person staff at all"; each
  // page checks its own section separately through requireMedicalStaff, so a
  // page added without a guard is not silently open to every staff member.
  const staff = await medicalStaff();
  if (!staff) redirect("/login?next=/medicals/admin");

  return (
    <MedicalAdminShell role={staff.role} name={staff.name}>
      {children}
    </MedicalAdminShell>
  );
}
