import { Package } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { SERVICE_MODULE_TABS } from "@/lib/data-bundles/service-module";
import { dataDb } from "@/lib/data-db";

/**
 * The Products module's title block and tab row.
 *
 * A component rather than a route layout, for the reason the affiliate module
 * uses one: the product editor has a header of its own and a layout would
 * stack a second one above it.
 *
 * The badge on Orders is the queue — paid, and not yet finished. It is read
 * here so it is visible from every tab rather than only from the one it
 * belongs to, which is the whole point of putting a number on a tab.
 */
export async function ServiceModuleHeader() {
  let open = 0;
  try {
    open = await dataDb.dataServiceOrder.count({
      where: { paymentStatus: "paid", status: { in: ["paid", "processing"] } },
    });
  } catch {
    // Services not migrated yet — no badge, and the tabs still work.
  }

  return (
    <>
      <ModuleHeader
        title="Products"
        subtitle="Registrations and services Nickimart handles — what they cost, who ordered them, and what is still outstanding."
        icon={Package}
      />
      <div className="mt-5">
        <ModuleTabs tabs={SERVICE_MODULE_TABS({ open })} />
      </div>
    </>
  );
}
