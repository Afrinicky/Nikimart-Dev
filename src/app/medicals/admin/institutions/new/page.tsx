import { Building2 } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { InstitutionForm } from "@/components/medical/console/InstitutionForm";
import { requireMedicalStaff } from "@/lib/medical/session";

export default async function NewInstitutionPage() {
  const staff = await requireMedicalStaff("/medicals/admin/institutions");
  return (
    <div className="max-w-4xl space-y-5">
      <ConsoleHeader
        title="New institution"
        icon={Building2}
        back={{ href: "/medicals/admin/institutions", label: "Institutions" }}
      />
      <InstitutionForm
        canSetCredit={["ADMIN", "MANAGER", "FINANCE"].includes(staff.role)}
      />
    </div>
  );
}
