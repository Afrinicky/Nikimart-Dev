import Link from "next/link";
import { Compass } from "lucide-react";
import { Container } from "@/components/ui/Container";

export default function NotFound() {
  return (
    <Container className="flex min-h-[55vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-niki-navy/5 text-niki-orange">
        <Compass className="h-7 w-7" />
      </span>
      <h1 className="font-display text-2xl font-bold text-niki-ink">Page not found</h1>
      <p className="max-w-md text-sm text-niki-ink/60">
        The page you&apos;re looking for doesn&apos;t exist or has moved. Let&apos;s get you back to shopping.
      </p>
      <Link
        href="/products"
        className="mt-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
      >
        Browse products
      </Link>
    </Container>
  );
}
