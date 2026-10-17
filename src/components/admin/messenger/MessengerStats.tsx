import { BookUser, Send, TriangleAlert, Users } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Four numbers across the top of the Messenger.
 *
 * Chosen for what they would make somebody do: how many people you can reach,
 * how they are grouped, what has gone out this month, and — the one that
 * matters — how much of it did not arrive. A failure count sitting at zero is
 * worth the space it takes, because the month it is not zero you want to have
 * been looking at it already.
 */
export function MessengerStats({
  stats,
}: {
  stats: { contacts: number; groups: number; sentThisMonth: number; failedThisMonth: number };
}) {
  const tiles = [
    { label: "Contacts", value: stats.contacts, icon: BookUser, tone: "ink" as const },
    { label: "Groups", value: stats.groups, icon: Users, tone: "ink" as const },
    { label: "Sent this month", value: stats.sentThisMonth, icon: Send, tone: "ink" as const },
    {
      label: "Not delivered",
      value: stats.failedThisMonth,
      icon: TriangleAlert,
      tone: stats.failedThisMonth > 0 ? ("danger" as const) : ("ink" as const),
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-2xl bg-white p-3.5 ring-1 ring-niki-edge sm:p-5">
          <div className="flex items-center gap-1.5 text-niki-ink/50 sm:gap-2">
            <t.icon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide sm:text-xs">
              {t.label}
            </span>
          </div>
          <p
            className={cn(
              "mt-1.5 font-figures text-lg font-bold sm:mt-2 sm:text-2xl",
              t.tone === "danger" ? "text-niki-danger" : "text-niki-ink",
            )}
          >
            {t.value}
          </p>
        </div>
      ))}
    </section>
  );
}
