import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MedicalAdminShell } from "@/components/medical/console/MedicalAdminShell";
import { DENIED_PATH, medicalAccess } from "@/lib/medical/session";
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
  //
  // The two refusals are different destinations on purpose: sending a
  // signed-in customer to /login is a loop, because the login page sees their
  // session and sends them straight back here.
  const access = await medicalAccess();
  if (access.kind === "anonymous") redirect("/login?callbackUrl=%2Fmedicals%2Fadmin");
  if (access.kind === "denied") redirect(DENIED_PATH);
  const { staff } = access;

  return (
    <MedicalAdminShell role={staff.role} name={staff.name}>
      {children}
    </MedicalAdminShell>
  );
}
