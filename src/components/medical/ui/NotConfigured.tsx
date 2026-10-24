import { DatabaseZap } from "lucide-react";

/**
 * What a medical page renders when this environment has no medical database.
 *
 * `MEDICAL_DATABASE_URL` has no fallback to `DATABASE_URL` — the medical
 * tables have never lived in the retail database and must not be created there
 * — so an environment without it has no medical application rather than a
 * broken one. This says so plainly instead of showing a shop with nothing in
 * it, which is the same screen as a catastrophic data loss and would send
 * somebody looking in the wrong place.
 */
export function NotConfigured() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-28 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-medi-mint-100 text-medi-teal-700">
        <DatabaseZap className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="medi-h1 mt-5">Nickimart Medical is not configured here</h1>
      <p className="medi-prose mt-3 text-medi-body">
        This environment has no medical database. Set <code className="font-mono text-[0.875rem] text-medi-ink">MEDICAL_DATABASE_URL</code>,
        deploy so the schema in <code className="font-mono text-[0.875rem] text-medi-ink">db/medical-migrations</code> is
        applied, then seed the catalogue.
      </p>
      <p className="medi-meta mt-5 text-medi-muted">
        The retail marketplace and the data-bundle platform are unaffected.
      </p>
    </div>
  );
}
