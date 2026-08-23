import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/motion";

/**
 * The agent platform's own loading state. It mirrors the real layout — dark
 * shell, four stat tiles, a grid of bundles — so the page settles into place
 * rather than replacing a spinner with a completely different shape.
 */
export default function AgentLoading() {
  return (
    <div className="niki-gradient-hero min-h-[calc(100vh-4rem)] pb-12">
      <Container className="pt-6">
        <div className="flex items-center gap-3">
          <Skeleton dark className="h-11 w-11 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton dark className="h-4 w-40" />
            <Skeleton dark className="h-3 w-28" />
          </div>
        </div>

        <div className="mt-5 flex gap-2 lg:hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} dark className="h-10 w-28 rounded-full" />
          ))}
        </div>

        <div className="mt-6 gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden space-y-2 lg:block">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} dark className="h-11 w-full" />
            ))}
          </aside>

          <main className="min-w-0 rounded-3xl bg-niki-surface p-4 shadow-2xl shadow-black/20 sm:p-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-2xl" />
              ))}
            </div>
            <Skeleton className="mt-6 h-20 rounded-2xl" />
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-2xl" />
              ))}
            </div>
          </main>
        </div>
      </Container>
    </div>
  );
}
