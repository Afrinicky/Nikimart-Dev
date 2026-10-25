import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/medical/ui/Breadcrumbs";

/**
 * The frame for a page that is mostly words.
 *
 * One measure, one rhythm, one set of headings — so that "How ordering works"
 * and "About" do not each invent their own. Narrower than the catalogue pages
 * on purpose: 68 characters is where a line of text stops being comfortable,
 * and a policy nobody can read is a policy nobody reads.
 */
export function ContentPage({
  title,
  lede,
  crumbs,
  children,
  aside,
}: {
  title: string;
  lede?: string;
  crumbs: { href?: string; label: string }[];
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
      <Breadcrumbs trail={crumbs} />

      <header className="mt-6 max-w-[42rem]">
        <h1 className="medi-h1 text-medi-ink">{title}</h1>
        {lede ? <p className="medi-lede mt-3 text-medi-body">{lede}</p> : null}
      </header>

      <div
        className={
          aside
            ? "mt-10 gap-12 lg:grid lg:grid-cols-[minmax(0,42rem)_1fr] lg:items-start"
            : "mt-10 max-w-[42rem]"
        }
      >
        <div className="min-w-0 space-y-9">{children}</div>
        {aside ? <div className="mt-10 lg:mt-0">{aside}</div> : null}
      </div>
    </div>
  );
}

export function ContentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="medi-h3 text-medi-ink">{title}</h2>
      <div className="medi-prose mt-2.5 space-y-3 text-medi-body">{children}</div>
    </section>
  );
}
