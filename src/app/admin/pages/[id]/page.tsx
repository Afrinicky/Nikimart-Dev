import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowUp, ArrowDown, Eye, EyeOff, ExternalLink, Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Field, inputClass } from "@/components/ui/Field";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { getPageWithSections } from "@/lib/pages";
import { BLOCK_DEFS, blockDef, type SectionConfig } from "@/lib/page-blocks";
import {
  addSection,
  deleteSection,
  moveSection,
  toggleSection,
  updatePageMeta,
} from "@/lib/page-actions";

export const metadata: Metadata = { title: "Edit page — Admin — NikiMart" };

type Params = Promise<{ id: string }>;

function sectionTitle(type: string, config: SectionConfig): string {
  return config.title || blockDef(type)?.label || type;
}

export default async function EditPageBuilder({ params }: { params: Params }) {
  const { id } = await params;
  const page = await getPageWithSections(id);
  if (!page) notFound();

  const url = page.slug === "home" ? "/" : `/pages/${page.slug}`;
  const sections = page.sections.map((s) => ({
    ...s,
    parsed: (() => {
      try {
        return JSON.parse(s.config) as SectionConfig;
      } catch {
        return {} as SectionConfig;
      }
    })(),
  }));

  return (
    <Container className="max-w-4xl py-8">
      <Link href="/admin/pages" className="flex items-center gap-1 text-sm text-niki-ink/60 hover:text-niki-ink">
        <ArrowLeft className="h-4 w-4" />
        Back to pages
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-niki-ink">{page.title}</h1>
        <Link href={url} target="_blank" className="inline-flex items-center gap-1 text-sm font-semibold text-niki-orange hover:underline">
          View page
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Page meta */}
      <form action={updatePageMeta.bind(null, id)} className="mt-6 rounded-2xl bg-white p-6 ring-1 ring-black/5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Page title" htmlFor="title">
            <input id="title" name="title" defaultValue={page.title} className={inputClass} />
          </Field>
          <label className="flex items-end gap-2 pb-3 text-sm text-niki-ink/80">
            <input type="checkbox" name="isPublished" defaultChecked={page.isPublished} className="h-4 w-4 rounded" />
            Published (visible on the site)
          </label>
        </div>
        <button type="submit" className="mt-2 rounded-full bg-niki-navy px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-niki-navy-light">
          Save page settings
        </button>
      </form>

      {/* Sections */}
      <h2 className="mt-8 font-display text-lg font-bold text-niki-ink">Sections</h2>
      <div className="mt-4 space-y-3">
        {sections.map((s, i) => (
          <div
            key={s.id}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5 ${s.isVisible ? "" : "opacity-60"}`}
          >
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold text-niki-ink">
                {sectionTitle(s.type, s.parsed)}
                <span className="rounded-full bg-niki-surface px-2 py-0.5 text-[11px] font-medium text-niki-ink/50">
                  {blockDef(s.type)?.label ?? s.type}
                </span>
              </p>
              {s.parsed.subtitle ? <p className="mt-0.5 truncate text-sm text-niki-ink/60">{s.parsed.subtitle}</p> : null}
            </div>

            <div className="flex items-center gap-1">
              <form action={moveSection}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="direction" value="up" />
                <button type="submit" disabled={i === 0} title="Move up" className="rounded-lg p-1.5 text-niki-ink/60 hover:bg-niki-navy/5 disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" />
                </button>
              </form>
              <form action={moveSection}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="direction" value="down" />
                <button type="submit" disabled={i === sections.length - 1} title="Move down" className="rounded-lg p-1.5 text-niki-ink/60 hover:bg-niki-navy/5 disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" />
                </button>
              </form>
              <form action={toggleSection}>
                <input type="hidden" name="id" value={s.id} />
                <button type="submit" title={s.isVisible ? "Hide" : "Show"} className="rounded-lg p-1.5 text-niki-ink/60 hover:bg-niki-navy/5">
                  {s.isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </form>
              <Link href={`/admin/pages/${id}/${s.id}`} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-navy/5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
              <DeleteButton id={s.id} action={deleteSection} label="" title="Remove section" />
            </div>
          </div>
        ))}
        {sections.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-sm text-niki-ink/50 ring-1 ring-black/5">No sections yet. Add one below.</p>
        ) : null}
      </div>

      {/* Add section */}
      <form action={addSection} className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl bg-niki-surface p-5 ring-1 ring-black/5">
        <input type="hidden" name="pageId" value={id} />
        <div className="flex-1">
          <Field label="Add a section block" htmlFor="type">
            <select id="type" name="type" className={inputClass} defaultValue="product_rail">
              {BLOCK_DEFS.map((b) => (
                <option key={b.type} value={b.type}>
                  {b.label} — {b.description}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <button type="submit" className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light">
          <Plus className="h-4 w-4" />
          Add
        </button>
      </form>
    </Container>
  );
}
