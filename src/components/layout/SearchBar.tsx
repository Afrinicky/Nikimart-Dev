import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export function SearchBar({ className }: { className?: string }) {
  return (
    <form
      action="/products"
      method="GET"
      className={cn(
        "flex w-full items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-sm ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-niki-orange",
        className,
      )}
    >
      <Search className="h-4 w-4 shrink-0 text-niki-ink/40" />
      <input
        type="text"
        name="q"
        placeholder="Search products, shops, services..."
        className="w-full bg-transparent text-sm text-niki-ink outline-none placeholder:text-niki-ink/40"
      />
      <button
        type="submit"
        className="shrink-0 rounded-full bg-niki-orange px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-niki-orange-light"
      >
        Search
      </button>
    </form>
  );
}
