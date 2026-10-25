import { Settings as SettingsIcon, ShieldAlert } from "lucide-react";
import { ConsoleHeader, PanelHeading } from "@/components/medical/console/ConsoleHeader";
import { SettingsForm } from "@/components/medical/console/SettingsForm";
import { requireMedicalStaff } from "@/lib/medical/session";
import { listSettings, SETTING_GROUPS } from "@/lib/medical/settings";
import { formatDateTime } from "@/lib/medical/format";

/**
 * The handful of decisions the business makes once.
 *
 * Administrator only. Deliberately short: a setting for everything is how a
 * system ends up with four hundred of them and no behaviour anybody can
 * predict, so anything that is really a rule lives in code where it can be
 * tested. What is here is the business's own name, its documents' defaults, and
 * the two switches that stay off until a regulatory question has been answered.
 */
export default async function SettingsPage() {
  await requireMedicalStaff("/medicals/admin/settings");
  const rows = await listSettings();

  const byGroup = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byGroup.get(row.group) ?? [];
    list.push(row);
    byGroup.set(row.group, list);
  }

  // Known groups in the order they are presented, then anything a later
  // migration added that this page has not been told about — listed rather than
  // dropped, because a setting nobody can see is a setting nobody can fix.
  const known = new Set<string>(SETTING_GROUPS.map((g) => g.key));
  const extras = [...byGroup.keys()].filter((key) => !known.has(key)).sort();

  const latest = rows.reduce<Date | null>(
    (newest, row) => (!newest || row.updatedAt > newest ? row.updatedAt : newest),
    null,
  );

  return (
    <div className="space-y-7">
      <ConsoleHeader
        title="Settings"
        subtitle={
          latest
            ? `Business-wide defaults. Last changed ${formatDateTime(latest)}.`
            : "Business-wide defaults."
        }
        icon={SettingsIcon}
      />

      <p className="medi-meta flex items-start gap-2 rounded-xl bg-medi-warning-soft px-3.5 py-3 text-medi-warning">
        <ShieldAlert className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          Two switches under Finance are held off on purpose. Tax is off because Ghana&rsquo;s VAT,
          NHIL and GETFund cannot be expressed as one rate and no treatment is implemented;
          instalments are off pending the consumer-credit position. Turning either on changes what
          customers are shown and charged — read{" "}
          <span className="font-figures">docs/medical/REGULATORY.md</span> first.
        </span>
      </p>

      {rows.length === 0 ? (
        <div className="medi-panel medi-panel-lg px-6 py-14 text-center">
          <p className="text-[0.9375rem] font-bold text-medi-ink">No settings yet</p>
          <p className="medi-prose mx-auto mt-1 text-[0.875rem] text-medi-body">
            Run <span className="font-figures">npm run medical:seed</span> to create them. Nothing
            is invented here — each one is a row somebody can change.
          </p>
        </div>
      ) : null}

      {SETTING_GROUPS.map((group) => {
        const groupRows = byGroup.get(group.key);
        if (!groupRows || groupRows.length === 0) return null;
        return (
          <section key={group.key}>
            <PanelHeading title={group.label} subtitle={group.blurb} />
            <div className="mt-4">
              <SettingsForm group={group.key} rows={groupRows} />
            </div>
          </section>
        );
      })}

      {extras.map((key) => (
        <section key={key}>
          <PanelHeading
            title={key}
            subtitle="Added after this screen was written, so it has no description of its own yet."
          />
          <div className="mt-4">
            <SettingsForm group={key} rows={byGroup.get(key) ?? []} />
          </div>
        </section>
      ))}
    </div>
  );
}
