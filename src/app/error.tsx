"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCw } from "lucide-react";
import { Container } from "@/components/ui/Container";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for server logs / observability.
    console.error(error);
  }, [error]);

  return (
    <Container className="flex min-h-[55vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-niki-danger/10 text-niki-danger">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="font-display text-xl font-bold text-niki-ink">Something went wrong</h1>
      <p className="max-w-md text-sm text-niki-ink/60">
        We hit a snag loading this page. Please try again — if it keeps happening, refresh in a moment.
      </p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <RotateCw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-niki-ink/70 ring-1 ring-black/10 transition-colors hover:bg-white"
        >
          Go home
        </Link>
      </div>
    </Container>
  );
}
