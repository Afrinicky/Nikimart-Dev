import type { Metadata } from "next";
import { Mail, MessageSquare, Megaphone, PencilLine } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ModuleHeader } from "@/components/admin/ModuleHeader";
import { ModuleTabs } from "@/components/admin/ModuleTabs";
import { ActionLink } from "@/components/ui/motion";
import { ANNOUNCEMENT_MODULE_TABS } from "@/lib/announcement-module";
import { listTemplates } from "@/lib/messages";
import { templateGroups } from "@/lib/message-templates";
import { isSmsConfigured, emailStatus } from "@/lib/notifications";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Messages — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * Every automatic message the bundle side sends, and the words in it.
 *
 * These were string literals in a dozen files, which meant changing a word a
 * customer actually reads took a developer and a deploy. The defaults still
 * live in the code — something has to be sent when the database is empty — but
 * an edit here overrides one, and the next message out uses it.
 *
 * Only messages that are really wired appear. Being able to edit something
 * nothing sends is worse than not being able to edit it at all.
 */
export default async function AdminDataMessagesPage() {
  const [templates] = await Promise.all([listTemplates("data")]);
  const groups = templateGroups("data");
  const smsOn = isSmsConfigured();
  const email = emailStatus();

  return (
    <Container className="py-8">
      <ModuleHeader
        title="Announcements"
        subtitle="What Nickimart says to people: on their screen, when something happens, and on purpose."
        icon={Megaphone}
      />
      <div className="mt-5">
        <ModuleTabs tabs={ANNOUNCEMENT_MODULE_TABS("data")} />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Status
          ok={smsOn}
          icon={MessageSquare}
          label="Text messages"
          detail={
            smsOn
              ? "Going out through Arkesel."
              : "ARKESEL_API_KEY isn't set, so no text message is sent at all."
          }
        />
        <Status
          ok={email.deliverable}
          icon={Mail}
          label="Email"
          detail={email.deliverable ? `Sent from ${email.from}.` : email.detail}
        />
      </div>

      {groups.map((group) => (
        <section key={group} className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
            {group}
          </h2>
          <ul className="space-y-2">
            {templates
              .filter((t) => t.group === group)
              .map((t) => (
                <li key={t.key}>
                  <ActionLink
                    href={`/admin/data/messages/${encodeURIComponent(t.key)}`}
                    className="niki-focus block rounded-2xl bg-white p-5 ring-1 ring-niki-edge transition-colors hover:ring-niki-orange/50"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-niki-ink">{t.name}</p>
                        <p className="mt-0.5 text-xs text-niki-ink/55">{t.description}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {t.edited ? (
                          <span className="flex items-center gap-1 rounded-md bg-niki-orange/10 px-2 py-0.5 text-[10px] font-bold uppercase text-niki-orange">
                            <PencilLine className="h-3 w-3" />
                            Edited
                          </span>
                        ) : null}
                        <Channel on={t.smsEnabled} label="SMS" />
                        {t.hasEmail ? <Channel on={t.emailEnabled} label="Email" /> : null}
                      </div>
                    </div>
                    <p className="mt-3 truncate rounded-xl bg-niki-surface px-3 py-2 text-xs text-niki-ink/65">
                      {t.currentSms}
                    </p>
                  </ActionLink>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </Container>
  );
}

function Channel({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        "rounded-md px-2 py-0.5 text-[10px] font-bold uppercase",
        on ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/45",
      )}
    >
      {label} {on ? "on" : "off"}
    </span>
  );
}

function Status({
  ok,
  icon: Icon,
  label,
  detail,
}: {
  ok: boolean;
  icon: React.ElementType;
  label: string;
  detail: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-2xl px-5 py-4 ring-1",
        ok ? "bg-white ring-niki-edge" : "bg-amber-50 ring-amber-200",
      )}
    >
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ok ? "text-niki-success" : "text-amber-600")} />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-niki-ink">{label}</p>
        <p className="text-xs text-niki-ink/60">{detail}</p>
      </div>
    </div>
  );
}
