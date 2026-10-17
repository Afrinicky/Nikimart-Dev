"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  Mail,
  MessageSquare,
  MessagesSquare,
  Phone,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { Composer, type ComposerAudience, type ComposerContact } from "./Composer";
import { cn } from "@/lib/cn";

/**
 * The chats half of the Messenger.
 *
 * Laid out the way every messaging app is, because that layout is not a style
 * choice — it is the one people already know. A list of conversations on the
 * left, the conversation on the right, the composer pinned under it. On a
 * phone the two become one: the list, and then the conversation on top of it
 * with a way back.
 *
 * What it is honest about: these threads are one-sided. Nickimart sends by SMS
 * and email, and neither comes back into the console, so every bubble here is
 * ours. Drawing the right-hand side as though a reply might appear would be a
 * lie the first time somebody waited for one.
 */

export interface ChatMessage {
  id: string;
  channel: string;
  subject: string;
  body: string;
  status: string;
  sentBy: string;
  createdAt: string;
}

export interface ChatThread {
  contact: ComposerContact & { tags: string[] };
  lastBody: string;
  lastAt: string | null;
  count: number;
}

export function ChatView({
  scope,
  threads,
  contacts,
  groups,
  audiences,
  active,
  messages,
}: {
  scope: "data" | "retail";
  threads: ChatThread[];
  contacts: ComposerContact[];
  groups: { tag: string; count: number }[];
  audiences: ComposerAudience[];
  active: (ComposerContact & { tags: string[] }) | null;
  messages: ChatMessage[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [composing, setComposing] = useState(!active);

  const base = scope === "retail" ? "/admin/messenger" : "/admin/data/messenger";
  const shown = search.trim()
    ? threads.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.contact.name.toLowerCase().includes(q) ||
          t.contact.phone.includes(q) ||
          t.contact.email.toLowerCase().includes(q)
        );
      })
    : threads;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* --- The list -------------------------------------------------- */}
      <aside
        className={cn(
          "rounded-2xl bg-white ring-1 ring-niki-edge",
          active ? "hidden lg:block" : "block",
        )}
      >
        <div className="border-b border-niki-edge p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-niki-ink/35" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search contacts"
              aria-label="Search conversations"
              className="h-10 w-full rounded-xl border border-niki-edge-strong bg-white pl-9 pr-3 text-sm text-niki-ink outline-none transition-colors placeholder:text-niki-ink/40 focus:border-niki-orange"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setComposing(true);
              router.push(base);
            }}
            className="niki-press niki-focus mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-niki-black px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-black-soft"
          >
            <MessagesSquare className="h-4 w-4 text-niki-orange" />
            New message
          </button>
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-niki-ink/50">
            {threads.length === 0
              ? "No contacts yet. Add some on the Contacts tab, or import a spreadsheet."
              : "Nobody matches that."}
          </p>
        ) : (
          <ul className="max-h-[32rem] divide-y divide-niki-edge overflow-y-auto">
            {shown.map((t) => {
              const on = active?.id === t.contact.id;
              return (
                <li key={t.contact.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setComposing(false);
                      router.push(`${base}?c=${encodeURIComponent(t.contact.id)}`);
                    }}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "niki-focus block w-full px-4 py-3 text-left transition-colors",
                      on ? "bg-niki-orange/5" : "hover:bg-niki-surface",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={t.contact.name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-niki-ink">
                            {t.contact.name}
                          </p>
                          {t.lastAt ? (
                            <span className="shrink-0 text-[11px] text-niki-ink/40">
                              {shortWhen(t.lastAt)}
                            </span>
                          ) : null}
                        </div>
                        <p className="truncate text-xs text-niki-ink/50">
                          {t.lastBody || t.contact.phone || t.contact.email}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>

      {/* --- The conversation ------------------------------------------ */}
      <section className="min-w-0">
        {active ? (
          <div className="flex h-full flex-col gap-3">
            <header className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-niki-edge">
              <button
                type="button"
                onClick={() => router.push(base)}
                aria-label="Back to conversations"
                className="niki-focus rounded-lg p-1.5 text-niki-ink/50 hover:bg-niki-black/5 lg:hidden"
              >
                <X className="h-4 w-4" />
              </button>
              <Avatar name={active.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-niki-ink">{active.name}</p>
                <p className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-niki-ink/50">
                  {active.phone ? (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {active.phone}
                    </span>
                  ) : null}
                  {active.email ? (
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      {active.email}
                    </span>
                  ) : null}
                </p>
              </div>
              {active.tags.length > 0 ? (
                <div className="hidden shrink-0 flex-wrap gap-1 sm:flex">
                  {active.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="rounded-md bg-niki-orange/10 px-2 py-0.5 text-[10px] font-bold uppercase text-niki-orange"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              ) : null}
            </header>

            <div className="min-h-[14rem] rounded-2xl bg-niki-surface p-4 ring-1 ring-niki-edge">
              {messages.length === 0 ? (
                <p className="py-10 text-center text-sm text-niki-ink/45">
                  Nothing sent to {active.name.split(" ")[0]} yet.
                </p>
              ) : (
                <ul className="flex max-h-[26rem] flex-col gap-2.5 overflow-y-auto">
                  {messages.map((m) => (
                    <li key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white px-4 py-2.5 shadow-sm ring-1 ring-niki-edge">
                        {m.subject ? (
                          <p className="mb-1 text-xs font-semibold text-niki-ink/70">{m.subject}</p>
                        ) : null}
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-niki-ink/85">
                          {m.body}
                        </p>
                        <p className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-niki-ink/40">
                          <ChannelIcon channel={m.channel} />
                          {shortWhen(m.createdAt)}
                          {m.sentBy ? ` · ${m.sentBy}` : ""}
                          <Receipt status={m.status} />
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Composer
              // Remount per conversation: the composer seeds its recipient
              // from this prop on mount, so without a key, opening a second
              // thread would type into the first one.
              key={active.id}
              scope={scope}
              contacts={contacts}
              groups={groups}
              audiences={audiences}
              fixedContact={active}
              compact
            />
            <p className="px-1 text-xs text-niki-ink/45">
              Replies arrive on the phone or inbox this was sent from, not here — Nickimart sends
              by text and email.
            </p>
          </div>
        ) : composing ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-white px-5 py-4 ring-1 ring-niki-edge">
              <h2 className="font-display font-bold text-niki-ink">New message</h2>
              <p className="mt-0.5 text-xs text-niki-ink/55">
                Pick contacts, a group, or type a number straight in.
              </p>
            </div>
            <Composer
              scope={scope}
              contacts={contacts}
              groups={groups}
              audiences={audiences}
              showAudiences
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-niki-orange/10 text-xs font-bold text-niki-orange">
      {initials}
    </span>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === "email") return <Mail className="h-3 w-3" aria-label="Email" />;
  if (channel === "both")
    return (
      <span className="flex items-center gap-0.5">
        <MessageSquare className="h-3 w-3" aria-label="Text and email" />
        <Mail className="h-3 w-3" />
      </span>
    );
  return <MessageSquare className="h-3 w-3" aria-label="Text message" />;
}

/**
 * Whether the gateway took it.
 *
 * Not whether it was read — nothing here can know that, and a tick that
 * implies it would be worse than no tick at all.
 */
function Receipt({ status }: { status: string }) {
  if (status === "failed") {
    return <TriangleAlert className="h-3 w-3 text-niki-danger" aria-label="Not delivered" />;
  }
  if (status === "partial") return <Check className="h-3 w-3 text-amber-600" aria-label="Partly sent" />;
  return <CheckCheck className="h-3 w-3 text-niki-success" aria-label="Sent" />;
}

/** "14:05" today, "12 Oct" this year, "12 Oct 24" before that. */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "2-digit" }),
  });
}
