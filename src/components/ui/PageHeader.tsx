import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({
  title,
  subtitle,
  crumbs = [],
  tone = "light",
  children,
}: {
  title: string;
  subtitle?: string;
  crumbs?: Crumb[];
  tone?: "light" | "dark";
  children?: ReactNode;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn(dark ? "niki-gradient-hero text-white" : "bg-white ring-1 ring-black/5")}>
      <Container className="py-8 sm:py-10">
        <nav
          className={cn(
            "flex flex-wrap items-center gap-1 text-xs",
            dark ? "text-white/60" : "text-niki-ink/50",
          )}
        >
          <Link href="/" className="hover:text-niki-orange">
            Home
          </Link>
          {crumbs.map((c) => (
            <span key={c.label} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3" />
              {c.href ? (
                <Link href={c.href} className="hover:text-niki-orange">
                  {c.label}
                </Link>
              ) : (
                <span className={dark ? "text-white/90" : "text-niki-ink/80"}>{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1
              className={cn(
                "font-display text-2xl font-bold sm:text-3xl",
                dark ? "text-white" : "text-niki-ink",
              )}
            >
              {title}
            </h1>
            {subtitle ? (
              <p className={cn("mt-2 max-w-2xl text-sm", dark ? "text-white/70" : "text-niki-ink/60")}>
                {subtitle}
              </p>
            ) : null}
          </div>
          {children ? <div className="shrink-0">{children}</div> : null}
        </div>
      </Container>
    </div>
  );
}
