"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Mail, MessageSquare, Paperclip, Send, Users, X } from "lucide-react";
import { inputClass } from "@/components/ui/Field";
import { SubmitButton } from "@/components/ui/motion";
import { FormFeedback } from "@/components/ui/FormFeedback";
import { previewSend, sendMessengerMessage, type SendState } from "@/lib/messenger-actions";
import { renderMessage, smsSegments } from "@/lib/message-templates";
import { cn } from "@/lib/cn";

/**
 * Writing a message and sending it.
 *
 * One composer for the note to one person and the broadcast to four hundred,
 * because that is what they are. The To line takes contacts, groups, one of
 * the platform's own audiences, or a number typed straight in — the same box,
 * the way a mail client works, rather than four screens that each send.
 *
 * The one thing it never hides is the bill. The count and the SMS parts are
 * live above the button, because a cedi sign in the text quietly drops a
 * message from 160 characters a part to 70 and triples what a send costs
 * without changing anything you can see.
 */

export interface ComposerContact {
  id: string;
  name: string;
  phone: string;
  email: string;
}

export interface ComposerAudience {
  value: string;
  label: string;
  note: string;
}

export interface ComposerProps {
  scope: "data" | "retail";
  /** Everyone in the book, for the picker. */
  contacts: ComposerContact[];
  groups: { tag: string; count: number }[];
  audiences: ComposerAudience[];
  /** Pre-selected recipient, when the composer opens inside a conversation. */
  fixedContact?: ComposerContact;
  /** Hide the recipient controls entirely — a thread already knows who. */
  compact?: boolean;
  /** Pre-ticked groups, for the broadcast screen. */
  showAudiences?: boolean;
}

type Estimate = {
  people: number;
  reachable: number;
  withPhone: number;
  withEmail: number;
  segments: number;
  totalSegments: number;
  unicode: boolean;
};

export function Composer({
  scope,
  contacts,
  groups,
  audiences,
  fixedContact,
  compact = false,
  showAudiences = false,
}: ComposerProps) {
  const [state, formAction] = useActionState<SendState, FormData>(sendMessengerMessage, {});

  const [picked, setPicked] = useState<string[]>(fixedContact ? [fixedContact.id] : []);
  const [tags, setTags] = useState<string[]>([]);
  const [audience, setAudience] = useState("none");
  const [raw, setRaw] = useState("");
  const [search, setSearch] = useState("");

  const [channel, setChannel] = useState<"sms" | "email" | "both">("sms");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [counting, startCounting] = useTransition();

  const byId = useMemo(() => new Map(contacts.map((c) => [c.id, c])), [contacts]);

  // Recount when the audience or the text settles. A number that lags behind
  // the form is worse than no number, so it is cleared while it is stale.
  useEffect(() => {
    const t = setTimeout(() => {
      startCounting(async () => {
        try {
          setEstimate(
            await previewSend(
              scope,
              { contactIds: picked, tags, audience, raw },
              body,
              channel,
            ),
          );
        } catch {
          setEstimate(null);
        }
      });
    }, 350);
    return () => clearTimeout(t);
  }, [scope, picked, tags, audience, raw, body, channel]);

  const parts = smsSegments(body);
  const bulk = (estimate?.reachable ?? 0) > 5;
  const ready = Boolean(estimate && estimate.reachable > 0 && body.trim().length >= 2);

  const matches = search.trim()
    ? contacts
        .filter((c) => {
          const q = search.toLowerCase();
          return (
            c.name.toLowerCase().includes(q) ||
            c.phone.includes(q) ||
            c.email.toLowerCase().includes(q)
          );
        })
        .slice(0, 6)
    : [];

  return (
    <form action={formAction} className="rounded-2xl bg-white p-4 ring-1 ring-niki-edge sm:p-5">
      <input type="hidden" name="scope" value={scope} />
      {picked.map((id) => (
        <input key={id} type="hidden" name="contactIds" value={id} />
      ))}
      {tags.map((t) => (
        <input key={t} type="hidden" name="tags" value={t} />
      ))}
      <input type="hidden" name="audience" value={audience} />
      <input type="hidden" name="confirmedCount" value={estimate?.reachable ?? 0} />

      {compact ? null : (
        <>
          {/* --- To ------------------------------------------------------- */}
          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-niki-ink">To</p>
            <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-niki-edge-strong bg-white px-2.5 py-2">
              {picked.map((id) => {
                const c = byId.get(id);
                if (!c) return null;
                return (
                  <Chip
                    key={id}
                    label={c.name}
                    onRemove={() => setPicked((p) => p.filter((x) => x !== id))}
                  />
                );
              })}
              {tags.map((t) => (
                <Chip
                  key={t}
                  tone="group"
                  label={`${t} · group`}
                  onRemove={() => setTags((p) => p.filter((x) => x !== t))}
                />
              ))}
              <input
                aria-label="Add a contact, or type a number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  // Enter on a typed number adds it as a one-off recipient,
                  // the way a mail client accepts an address nobody saved.
                  if (e.key !== "Enter" || !search.trim()) return;
                  e.preventDefault();
                  const first = matches[0];
                  if (first) {
                    setPicked((p) => (p.includes(first.id) ? p : [...p, first.id]));
                  } else {
                    setRaw((r) => (r ? `${r}, ${search.trim()}` : search.trim()));
                  }
                  setSearch("");
                }}
                placeholder={
                  picked.length + tags.length === 0 ? "Name, number or email…" : "Add another…"
                }
                className="min-w-[10rem] flex-1 border-0 bg-transparent px-1.5 py-1 text-sm text-niki-ink outline-none placeholder:text-niki-ink/40"
              />
            </div>

            {matches.length > 0 ? (
              <ul className="mt-1.5 overflow-hidden rounded-xl bg-niki-surface ring-1 ring-niki-edge">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked((p) => (p.includes(c.id) ? p : [...p, c.id]));
                        setSearch("");
                      }}
                      className="niki-focus flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm hover:bg-niki-black/5"
                    >
                      <span className="font-medium text-niki-ink">{c.name}</span>
                      <span className="truncate text-xs text-niki-ink/50">
                        {c.phone || c.email}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {raw ? (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-niki-ink/55">
                <Paperclip className="h-3 w-3" />
                Typed in: {raw}
                <button
                  type="button"
                  onClick={() => setRaw("")}
                  className="niki-focus rounded px-1 font-semibold text-niki-ink/45 hover:text-niki-danger"
                >
                  clear
                </button>
              </p>
            ) : null}
            <input type="hidden" name="to" value={raw} />
          </div>

          {/* --- Groups --------------------------------------------------- */}
          {groups.length > 0 ? (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
                Groups
              </p>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = tags.includes(g.tag);
                  return (
                    <button
                      key={g.tag}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setTags((p) => (on ? p.filter((x) => x !== g.tag) : [...p, g.tag]))
                      }
                      className={cn(
                        "niki-focus rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                        on
                          ? "bg-niki-orange text-white"
                          : "bg-niki-surface text-niki-ink/65 hover:bg-niki-black/5",
                      )}
                    >
                      {g.tag}
                      <span className={cn("ml-1.5 font-figures", on ? "text-white/70" : "text-niki-ink/40")}>
                        {g.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* --- Platform audiences --------------------------------------- */}
          {showAudiences ? (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-niki-ink/45">
                Or everyone in
              </p>
              <select
                aria-label="Platform audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                className={inputClass}
              >
                <option value="none">Nobody — use the contacts above</option>
                {audiences.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label} — {a.note}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </>
      )}

      {/* --- Channel ------------------------------------------------------ */}
      <div className="mb-3 flex gap-1.5 rounded-xl bg-niki-surface p-1">
        <ChannelChoice
          active={channel === "sms"}
          onClick={() => setChannel("sms")}
          icon={MessageSquare}
          label="Text"
        />
        <ChannelChoice
          active={channel === "email"}
          onClick={() => setChannel("email")}
          icon={Mail}
          label="Email"
        />
        <ChannelChoice
          active={channel === "both"}
          onClick={() => setChannel("both")}
          icon={Send}
          label="Both"
        />
      </div>
      <input type="hidden" name="channel" value={channel} />

      {channel !== "sms" ? (
        <input
          name="subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          aria-label="Subject"
          className={`${inputClass} mb-2.5`}
        />
      ) : (
        <input type="hidden" name="subject" value="" />
      )}

      <textarea
        name="body"
        rows={compact ? 3 : 5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        required
        aria-label="Message"
        placeholder="Write your message. {{name}} becomes their first name."
        className={`${inputClass} resize-y`}
      />

      {/* --- What it will cost -------------------------------------------- */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-niki-ink/55">
          <Users className="h-3.5 w-3.5" />
          {counting ? (
            "Counting…"
          ) : estimate ? (
            <>
              <span className="font-figures font-semibold text-niki-ink">{estimate.reachable}</span>
              {estimate.reachable === 1 ? " person" : " people"}
              {channel !== "email" ? ` · ${estimate.totalSegments} SMS parts` : ""}
            </>
          ) : (
            "Nobody yet"
          )}
        </span>
        <span className={cn("text-niki-ink/45", parts.unicode && "font-medium text-amber-700")}>
          {parts.length} characters · {parts.segments} part{parts.segments === 1 ? "" : "s"} each
          {parts.unicode ? " (a symbol like ₵ cuts a part from 160 to 70)" : ""}
        </span>
      </div>

      {body.trim() ? (
        <div className="mt-2.5 rounded-xl bg-niki-surface px-4 py-3 text-sm leading-relaxed text-niki-ink/75">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-niki-ink/40">
            As it arrives
          </p>
          {renderMessage(body, { name: "Ama" })}
        </div>
      ) : null}

      {bulk ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          This reaches {estimate?.reachable} people and cannot be recalled. The count is checked
          again when you send.
        </p>
      ) : null}

      <FormFeedback
        error={state.ok ? undefined : state.error}
        success={state.ok ? state.message : undefined}
        className="mt-3"
      />

      <SubmitButton
        disabled={!ready}
        pendingLabel="Sending…"
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-niki-orange px-4 py-3 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        <Send className="h-4 w-4" />
        {bulk ? `Send to ${estimate?.reachable}` : "Send"}
      </SubmitButton>
    </form>
  );
}

function Chip({
  label,
  onRemove,
  tone = "contact",
}: {
  label: string;
  onRemove: () => void;
  tone?: "contact" | "group";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold",
        tone === "group" ? "bg-niki-orange/10 text-niki-orange" : "bg-niki-black/5 text-niki-ink/75",
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="niki-focus rounded hover:text-niki-danger"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function ChannelChoice({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "niki-focus flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors",
        active ? "bg-white text-niki-ink shadow-sm ring-1 ring-niki-edge" : "text-niki-ink/55 hover:text-niki-ink",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
