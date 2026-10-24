import { Users } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { SupplierForm } from "@/components/medical/console/SupplierForm";
import { requireMedicalStaff } from "@/lib/medical/session";

export default async function NewSupplierPage() {
  await requireMedicalStaff("/medicals/admin/suppliers");
  return (
    <div className="max-w-4xl space-y-5">
      <ConsoleHeader
        title="Add a supplier"
        icon={Users}
        back={{ href: "/medicals/admin/suppliers", label: "Suppliers" }}
      />
      <SupplierForm />
    </div>
  );
}
