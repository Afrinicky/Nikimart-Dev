import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/motion";

/**
 * Route-level loading shapes.
 *
 * Every page here renders dynamically — live database plus per-request auth —
 * so a navigation always waits on a server round trip. A spinner in the middle
 * of an empty page tells you nothing about what's coming; a skeleton in the
 * shape of the real screen means the content fills in where the placeholders
 * already were, instead of the layout jumping when it lands.
 *
 * Four shapes cover the whole site. Pick the one whose layout the route
 * actually has — a wrong shape is worse than none, because it moves things
 * twice.
 */

/** The dark page header most routes open with. */
function HeaderSkeleton() {
  return (
    <div className="niki-gradient-hero">
      <Container className="space-y-3 py-8 sm:py-10">
        <Skeleton dark className="h-3 w-32" />
        <Skeleton dark className="h-8 w-64 max-w-full" />
        <Skeleton dark className="h-4 w-96 max-w-full" />
      </Container>
    </div>
  );
}

/** A grid of cards: products, shops, categories, campuses. */
export function GridSkeleton({
  count = 12,
  header = true,
  filters = false,
}: {
  count?: number;
  header?: boolean;
  filters?: boolean;
}) {
  return (
    <>
      {header ? <HeaderSkeleton /> : null}
      <Container className="py-8">
        {filters ? (
          <div className="mb-6 flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-24 rounded-full" />
            ))}
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge">
              <Skeleton className="aspect-square w-full rounded-none" />
              <div className="space-y-2 p-3">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-20" />
              </div>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}

/** One thing in detail: a gallery beside its facts. */
export function DetailSkeleton() {
  return (
    <Container className="py-8">
      <div className="grid gap-8 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-3xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-20 w-full rounded-2xl" />
          <div className="flex gap-3">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-32 rounded-full" />
          </div>
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </div>
    </Container>
  );
}

/** Stat tiles over a table — every dashboard on the site. */
export function DashboardSkeleton({ tiles = 4, rows = 6 }: { tiles?: number; rows?: number }) {
  return (
    <>
      <HeaderSkeleton />
      <Container className="py-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: tiles }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="mt-8 h-6 w-40" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </Container>
    </>
  );
}

/** A narrow column: forms, checkout, trackers, help. */
export function PanelSkeleton({ header = true, blocks = 3 }: { header?: boolean; blocks?: number }) {
  return (
    <>
      {header ? <HeaderSkeleton /> : null}
      <Container className="py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {Array.from({ length: blocks }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-3xl" />
          ))}
        </div>
      </Container>
    </>
  );
}
