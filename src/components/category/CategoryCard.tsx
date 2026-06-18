import Link from "next/link";
import { Tag } from "lucide-react";
import type { Category } from "@/lib/types";
import { ICON_MAP } from "@/lib/icon-map";

export function CategoryCard({ category }: { category: Category }) {
  const Icon = ICON_MAP[category.icon] ?? Tag;

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex flex-col items-center gap-2.5 rounded-2xl bg-white p-4 text-center ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-niki-navy/10 hover:ring-niki-orange/30"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-niki-navy text-niki-orange transition-colors duration-300 group-hover:bg-niki-orange group-hover:text-white">
        <Icon className="h-6 w-6" strokeWidth={1.75} />
      </span>
      <span className="text-xs font-semibold leading-tight text-niki-ink sm:text-sm">
        {category.name}
      </span>
    </Link>
  );
}
