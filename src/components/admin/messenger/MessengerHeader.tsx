import { Megaphone } from "lucide-react";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs, type ModuleTab } from "@/components/admin/ModuleTabs";
import { MessengerTabs } from "@/components/admin/messenger/MessengerTabs";

/**
 * The two rows of navigation every Messenger screen wears.
 *
 * One component rather than the same twenty lines on six pages, so the module
 * tabs and the Messenger's own tabs cannot drift apart between the chats
 * screen, the contacts screen, the broadcast screen and the automatic
 * messages — which is exactly how a console ends up feeling like four
 * different products.
 */
export function MessengerHeader({
  scope,
  tabs,
}: {
  scope: "data" | "retail";
  tabs: ModuleTab[];
}) {
  return (
    <>
      <ModuleHeader
        title="Announcements"
        subtitle="What Nickimart says to people: on their screen, when something happens, and on purpose."
        icon={Megaphone}
      />
      <div className="mt-5">
        <ModuleTabs tabs={tabs} />
      </div>
      <div className="mt-5">
        <MessengerTabs scope={scope} />
      </div>
    </>
  );
}
