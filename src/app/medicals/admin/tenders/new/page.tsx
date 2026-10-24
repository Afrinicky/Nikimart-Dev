import { Gavel } from "lucide-react";
import { ConsoleHeader } from "@/components/medical/console/ConsoleHeader";
import { TenderForm } from "@/components/medical/console/TenderForm";
import { MedicalButtonLink } from "@/components/medical/ui/MedicalButton";
import { requireMedicalStaff } from "@/lib/medical/session";
import { medicalDb, readMedical } from "@/lib/medical/db";

export default async function NewTenderPage() {
  await requireMedicalStaff("/medicals/admin/tenders");

  const organisations = await readMedical(
    () =>
      medicalDb.organisation.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    [],
  );

  return (
    <div className="max-w-4xl space-y-5">
      <ConsoleHeader
        title="Record a tender"
        icon={Gavel}
        back={{ href: "/medicals/admin/tenders", label: "Tenders" }}
      />

      {organisations.length === 0 ? (
        <div className="medi-panel medi-panel-lg px-6 py-12 text-center">
          <p className="text-[0.9375rem] font-bold text-medi-ink">No institutions yet</p>
          <p className="medi-prose mx-auto mt-1.5 text-[0.875rem] text-medi-body">
            A tender belongs to the hospital, laboratory or clinic running it. Add that institution
            first.
          </p>
          <MedicalButtonLink href="/medicals/admin/institutions/new" className="mt-5" size="sm">
            Add an institution
          </MedicalButtonLink>
        </div>
      ) : (
        <TenderForm organisations={organisations} />
      )}
    </div>
  );
}
