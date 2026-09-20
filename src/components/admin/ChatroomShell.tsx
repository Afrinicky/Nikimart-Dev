import { MessagesSquare } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { CHATROOM_TABS } from "@/lib/chat/module";

/** The Chatroom module's frame: one header, one tab row, every screen. */
export function ChatroomShell({
  unread,
  action,
  children,
}: {
  unread: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ModuleHeader
          title="Chatroom"
          subtitle="Enquiries from the site, team rooms, groups you made, and direct messages."
          icon={MessagesSquare}
        />
        {action}
      </div>
      <div className="mt-5">
        <ModuleTabs tabs={CHATROOM_TABS(unread)} />
      </div>
      {/* Room for the floating bubble on a phone, so a list never ends
          underneath it. */}
      <div className="mt-6 pb-20 sm:pb-0">{children}</div>
    </Container>
  );
}
