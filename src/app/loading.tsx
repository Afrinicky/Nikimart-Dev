import { Container } from "@/components/ui/Container";

/**
 * Route-level loading state. Because every route renders dynamically (live DB +
 * per-request auth), navigations wait on a server round-trip; this gives instant
 * visual feedback so clicks never feel dead — especially on a cold database.
 */
export default function Loading() {
  return (
    <Container className="flex min-h-[50vh] flex-col items-center justify-center gap-4 py-16">
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-niki-ink/10 border-t-niki-orange"
        aria-hidden
      />
      <p className="text-sm font-medium text-niki-ink/50">Loading…</p>
    </Container>
  );
}
