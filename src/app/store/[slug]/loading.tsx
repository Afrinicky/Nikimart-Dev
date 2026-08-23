import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/motion";

/** Storefront loading state: the network chooser and a grid of bundle cards. */
export default function StoreLoading() {
  return (
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
  );
}
