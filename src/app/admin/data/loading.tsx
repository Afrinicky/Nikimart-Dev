import { Container } from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/motion";

/** Loading state for every screen in the data console. */
export default function AdminDataLoading() {
  return (
    <Container className="py-8">
      <Skeleton className="h-8 w-48" />
      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-2xl" />
    </Container>
  );
}
