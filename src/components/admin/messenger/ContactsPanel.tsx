"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileSpreadsheet,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { Field, inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import {
  bulkContactAction,
  importContactsAction,
  pullInAudienceAction,
  saveContactAction,
  type MessengerState,
} from "@/lib/messenger-actions";
import { cn } from "@/lib/cn";

/**
 * The address book.
 *
 * Built around the two things people actually do with one: find somebody, and
 * get a list of people into it without typing four hundred rows. So search is
 * the first control on the screen, and import sits beside the table rather
 * than behind a settings page.
 *
 * Tick boxes drive everything bulk. Archiving is the default way to remove
 * somebody — the thread is the record of what was said to them, and deleting
 * a contact to tidy a list should not feel like deleting history. Delete is
 * there, one row down, for the duplicates and the typos.
 */

export interface PanelContact {
  id: string;
  name: string;
  phone: string;
  email: string;
  tags: string[];
  note: string;
  source: string;
  archived: boolean;
  lastMessageAt: string | null;
}

export function ContactsPanel({
  scope,
  contacts,
  total,
  groups,
  audiences,
  query,
  tag,
  archived,
  exportHref,
}: {
  scope: "data" | "retail";
  contacts: PanelContact[];
  total: number;
  groups: { tag: string; count: number }[];
  audiences: { value: string; label: string; note: string }[];
  query: string;
  tag: string;
  archived: boolean;
  exportHref: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PanelContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState(query);
  const [showImport, setShowImport] = useState(false);

  const [saveState, saveAction] = useActionState<MessengerState, FormData>(saveContactAction, {});
  const [bulkState, bulkAction] = useActionState<MessengerState, FormData>(bulkContactAction, {});
  const [importState, importAction] = useActionState<MessengerState, FormData>(
    importContactsAction,
    {},
  );
  const [pullState, pullAction] = useActionState<MessengerState, FormData>(
    pullInAudienceAction,
    {},
  );

  const base = scope === "retail" ? "/admin/messenger/contacts" : "/admin/data/messenger/contacts";

  function go(next: { q?: string; tag?: string; archived?: boolean }) {
    const params = new URLSearchParams();
    const q = next.q ?? search;
    const t = next.tag ?? tag;
    const a = next.archived ?? archived;
    if (q) params.set("q", q);
    if (t && t !== "all") params.set("tag", t);
    if (a) params.set("archived", "1");
    router.push(params.toString() ? `${base}?${params}` : base);
  }

  const allTicked = contacts.length > 0 && picked.length === contacts.length;

  return (
    <div className="space-y-4">
      {/* --- Controls ---------------------------------------------------- */}
      <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") go({ q: search });
              }}
              placeholder="Search by name, number, email or note"
              aria-label="Search contacts"
              className="h-11 w-full rounded-xl border border-niki-edge-strong bg-white pl-9 pr-3 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange"
            />
          </div>

          <select
            aria-label="Filter by group"
            value={tag}
            onChange={(e) => go({ tag: e.target.value })}
            className="h-11 rounded-xl border border-niki-edge-strong bg-white px-3 text-sm font-medium text-niki-ink outline-none focus:border-niki-orange"
          >
            <option value="all">Every group</option>
            {groups.map((g) => (
              <option key={g.tag} value={g.tag}>
                {g.tag} ({g.count})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => go({ archived: !archived })}
            aria-pressed={archived}
            className={cn(
              "niki-focus h-11 rounded-xl px-3.5 text-sm font-semibold transition-colors",
              archived
                ? "bg-niki-black text-white"
                : "bg-niki-surface text-niki-ink/65 hover:bg-niki-black/5",
            )}
          >
            {archived ? "Showing archived" : "Archived"}
          </button>

          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
            className="niki-press niki-focus flex h-11 items-center gap-1.5 rounded-xl bg-niki-orange px-4 text-sm font-bold text-white hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowImport((v) => !v)}
            className="niki-focus flex items-center gap-1.5 rounded-lg bg-niki-surface px-3 py-2 font-semibold text-niki-ink/70 hover:bg-niki-black/5"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Import from Excel
          </button>
          <a
            href={exportHref}
            className="niki-focus flex items-center gap-1.5 rounded-lg bg-niki-surface px-3 py-2 font-semibold text-niki-ink/70 hover:bg-niki-black/5"
          >
            <Download className="h-3.5 w-3.5" />
            Export to Excel
          </a>
          <span className="ml-auto text-niki-ink/45">
            {contacts.length} of {total} shown
          </span>
        </div>

        {showImport ? (
          <div className="mt-3 grid gap-3 rounded-xl bg-niki-surface p-4 lg:grid-cols-2">
            <form action={importAction} className="space-y-2.5">
              <input type="hidden" name="scope" value={scope} />
              <p className="text-sm font-semibold text-niki-ink">From a spreadsheet</p>
              <p className="text-xs text-niki-ink/55">
                .xlsx or .csv. Columns are matched by their headings — Name, Phone, Email, Groups,
                Note — in any order. Somebody already here is updated, not duplicated.
              </p>
              <input
                type="file"
                name="file"
                accept=".xlsx,.csv,.txt"
                required
                aria-label="Spreadsheet to import"
                className="w-full rounded-xl border border-niki-edge-strong bg-white px-3 py-2.5 text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-niki-black file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              />
              <input
                name="tag"
                placeholder="Put them all in this group (optional)"
                aria-label="Group for imported contacts"
                className={inputClass}
              />
              <FormFeedback
                error={importState.error}
                success={importState.ok ? importState.message : undefined}
              />
              <SubmitButton
                pendingLabel="Reading…"
                className="w-full rounded-xl bg-niki-black px-4 py-2.5 text-xs font-bold text-white hover:bg-niki-black-soft"
              >
                Import
              </SubmitButton>
            </form>

            <form action={pullAction} className="space-y-2.5">
              <input type="hidden" name="scope" value={scope} />
              <p className="text-sm font-semibold text-niki-ink">From Nickimart</p>
              <p className="text-xs text-niki-ink/55">
                Bring people the platform already knows about into the book, so you can tag them
                and write to them by hand afterwards.
              </p>
              <select name="audience" required aria-label="Who to bring in" className={inputClass}>
                <option value="">Choose a group…</option>
                {audiences.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label} — {a.note}
                  </option>
                ))}
              </select>
              <input
                name="tag"
                placeholder="Group to file them under (optional)"
                aria-label="Group for pulled-in contacts"
                className={inputClass}
              />
              <FormFeedback
                error={pullState.error}
                success={pullState.ok ? pullState.message : undefined}
              />
              <SubmitButton
                pendingLabel="Bringing them in…"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-niki-black px-4 py-2.5 text-xs font-bold text-white hover:bg-niki-black-soft"
              >
                <Users className="h-3.5 w-3.5" />
                Bring in
              </SubmitButton>
            </form>
          </div>
        ) : null}
      </div>

      {/* --- Add / edit -------------------------------------------------- */}
      {adding || editing ? (
        <form
          // The fields are uncontrolled, so without a key per contact, clicking
          // edit on a second row would keep the first row's values on screen.
          key={editing?.id ?? "new"}
          action={saveAction}
          className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5"
        >
          <input type="hidden" name="scope" value={scope} />
          {editing ? <input type="hidden" name="id" value={editing.id} /> : null}

          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold text-niki-ink">
              <UserRoundPlus className="h-4 w-4 text-niki-orange" />
              {editing ? `Editing ${editing.name}` : "New contact"}
            </p>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setEditing(null);
              }}
              className="niki-focus rounded-lg px-2 py-1 text-xs font-semibold text-niki-ink/55 hover:bg-niki-black/5"
            >
              Close
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="c-name">
              <input
                id="c-name"
                name="name"
                required
                defaultValue={editing?.name ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Phone" htmlFor="c-phone" hint="Either a phone or an email is enough.">
              <input
                id="c-phone"
                name="phone"
                inputMode="tel"
                defaultValue={editing?.phone ?? ""}
                placeholder="024 000 0000"
                className={inputClass}
              />
            </Field>
            <Field label="Email" htmlFor="c-email">
              <input
                id="c-email"
                name="email"
                type="email"
                defaultValue={editing?.email ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Groups" htmlFor="c-tags" hint="Comma separated. A group is just a label.">
              <input
                id="c-tags"
                name="tags"
                defaultValue={editing?.tags.join(", ") ?? ""}
                placeholder="Wholesalers, Kumasi"
                className={inputClass}
              />
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Note" htmlFor="c-note">
              <input
                id="c-note"
                name="note"
                defaultValue={editing?.note ?? ""}
                placeholder="Anything worth remembering about them"
                className={inputClass}
              />
            </Field>
          </div>

          <FormFeedback
            error={saveState.error}
            success={saveState.ok ? saveState.message : undefined}
            className="mt-3"
          />
          <SubmitButton
            pendingLabel="Saving…"
            className="mt-3 w-full rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
          >
            {editing ? "Save changes" : "Add contact"}
          </SubmitButton>
        </form>
      ) : null}

      {/* --- Bulk bar ---------------------------------------------------- */}
      {picked.length > 0 ? (
        <form
          action={bulkAction}
          className="flex flex-wrap items-center gap-2 rounded-2xl bg-niki-black px-4 py-3 text-white"
        >
          <input type="hidden" name="scope" value={scope} />
          {picked.map((id) => (
            <input key={id} type="hidden" name="ids" value={id} />
          ))}
          <span className="text-sm font-semibold">
            {picked.length} selected
          </span>
          <input
            name="tag"
            placeholder="Group name"
            aria-label="Group to add them to"
            className="h-9 w-36 rounded-lg border-0 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/45"
          />
          <BulkButton what="tag" icon={Tag} label="Add to group" />
          <BulkButton
            what={archived ? "restore" : "archive"}
            icon={archived ? ArchiveRestore : Archive}
            label={archived ? "Restore" : "Archive"}
          />
          <BulkButton what="delete" icon={Trash2} label="Delete" danger />
          <button
            type="button"
            onClick={() => setPicked([])}
            className="niki-focus ml-auto rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white/60 hover:text-white"
          >
            Clear
          </button>
        </form>
      ) : null}

      <FormFeedback error={bulkState.error} success={bulkState.ok ? bulkState.message : undefined} />

      {/* --- The table --------------------------------------------------- */}
      {contacts.length === 0 ? (
        <p className="rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-niki-edge">
          {total === 0
            ? "No contacts yet. Add one, import a spreadsheet, or bring people in from Nickimart."
            : "Nobody matches that."}
        </p>
      ) : (
        <div className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
          <div className="-mx-4 overflow-x-auto px-4 sm:-mx-5 sm:px-5">
            <table className="w-full min-w-[800px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="bg-niki-surface/70">
                  <th className="w-10 rounded-l-xl px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allTicked}
                      onChange={(e) => setPicked(e.target.checked ? contacts.map((c) => c.id) : [])}
                      aria-label="Select all shown"
                      className="h-4 w-4 accent-niki-orange"
                    />
                  </th>
                  <Th>Name</Th>
                  <Th>Phone</Th>
                  <Th>Email</Th>
                  <Th>Groups</Th>
                  <Th>Note</Th>
                  <th className="rounded-r-xl px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-niki-edge transition-colors last:border-0 hover:bg-niki-surface/50"
                  >
                    <td className="px-4 py-3.5">
                      <input
                        type="checkbox"
                        checked={picked.includes(c.id)}
                        onChange={(e) =>
                          setPicked((p) =>
                            e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id),
                          )
                        }
                        aria-label={`Select ${c.name}`}
                        className="h-4 w-4 accent-niki-orange"
                      />
                    </td>
                    <td className="px-4 py-3.5 font-medium text-niki-ink">{c.name}</td>
                    <td className="px-4 py-3.5 font-figures text-xs text-niki-ink/65">
                      {c.phone || "—"}
                    </td>
                    <td className="max-w-[14rem] truncate px-4 py-3.5 text-xs text-niki-ink/65">
                      {c.email || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="flex flex-wrap gap-1">
                        {c.tags.length === 0 ? (
                          <span className="text-xs text-niki-ink/35">—</span>
                        ) : (
                          c.tags.map((t) => (
                            <span
                              key={t}
                              className="rounded-md bg-niki-orange/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-niki-orange"
                            >
                              {t}
                            </span>
                          ))
                        )}
                      </span>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-3.5 text-xs text-niki-ink/50">
                      {c.note || "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(c);
                          setAdding(false);
                        }}
                        aria-label={`Edit ${c.name}`}
                        className="niki-focus rounded-lg p-1.5 text-niki-ink/45 hover:bg-niki-black/5 hover:text-niki-ink"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-niki-ink/45">
      {children}
    </th>
  );
}

function BulkButton({
  what,
  icon: Icon,
  label,
  danger = false,
}: {
  what: string;
  icon: React.ElementType;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      type="submit"
      name="what"
      value={what}
      className={cn(
        "niki-focus flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
        danger ? "bg-niki-danger/20 text-red-100 hover:bg-niki-danger/40" : "bg-white/10 hover:bg-white/20",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
