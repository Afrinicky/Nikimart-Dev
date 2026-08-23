import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/motion";

/**
 * The bundle store's loading state. Same shape as the real grid, so the prices
 * fill in where the placeholders already were.
 */
export default function DataBundlesLoading() {
  return (
    <>
      <div className="niki-gradient-hero">
        <Container className="space-y-3 py-8 sm:py-10">
          <Skeleton dark className="h-8 w-56" />
          <Skeleton dark className="h-4 w-80 max-w-full" />
        </Container>
      </div>

      <Container className="py-8">
        <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-2xl" />
          ))}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </Container>
    </>
  );
}
