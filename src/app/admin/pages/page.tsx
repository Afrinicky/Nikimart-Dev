import Link from "next/link";
import type { Metadata } from "next";
import { ExternalLink, Pencil, Plus, Sparkles } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { listPages } from "@/lib/pages";
import { deletePage, ensureDefaultPages } from "@/lib/page-actions";

export const metadata: Metadata = { title: "Pages — Admin — NikiMart" };

export default async function AdminPagesPage() {
  const pages = await listPages();
  const hasHome = pages.some((p) => p.slug === "home");

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Pages</h1>
          <p className="mt-1 text-sm text-niki-ink/60">Compose pages from section blocks.</p>
        </div>
        <Link
          href="/admin/pages/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New page
        </Link>
      </div>

      {!hasHome ? (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-niki-navy p-5">
          <p className="flex-1 text-sm text-white/80">
            The homepage is currently rendered from built-in defaults. Create editable copies of the
            <span className="font-semibold text-white"> Home</span> and
            <span className="font-semibold text-white"> About</span> pages to start customizing them.
          </p>
          <form action={ensureDefaultPages}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
            >
              <Sparkles className="h-4 w-4" />
              Create editable pages
            </button>
          </form>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-2xl bg-white ring-1 ring-black/5">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-black/5 text-xs uppercase tracking-wide text-niki-ink/50">
            <tr>
              <th className="px-5 py-3 font-semibold">Title</th>
              <th className="px-5 py-3 font-semibold">URL</th>
              <th className="px-5 py-3 font-semibold">Sections</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {pages.map((p) => {
              const url = p.slug === "home" ? "/" : `/pages/${p.slug}`;
              return (
                <tr key={p.id}>
                  <td className="px-5 py-3 font-medium text-niki-ink">
                    {p.title}
                    {p.isSystem ? <span className="ml-2 text-xs text-niki-ink/40">(system)</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    <Link href={url} className="inline-flex items-center gap-1 text-niki-orange hover:underline" target="_blank">
                      {url}
                      <ExternalLink className="h-3 w-3" />
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-niki-ink/70">{p._count.sections}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.isPublished ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"}`}>
                      {p.isPublished ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/pages/${p.id}`}
                        className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 transition-colors hover:bg-niki-navy/5"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Link>
                      <DeleteButton
                        id={p.id}
                        action={deletePage}
                        disabled={p.isSystem}
                        title={p.isSystem ? "System pages can't be deleted" : undefined}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
            {pages.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-sm text-niki-ink/50">
                  No editable pages yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </Container>
  );
}
