"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { categoryIcon } from "@/lib/medical/icons";
import type { CategoryNode } from "@/lib/medical/categories";

/**
 * The catalogue, in one panel.
 *
 * A hover-opened mega menu with a column per category is the conventional
 * answer and it is the wrong one here: twelve categories with three to six
 * children each is seventy links, and a panel that appears under a moving
 * cursor and vanishes when it drifts is unusable for anyone with a tremor, a
 * trackpad or a keyboard.
 *
 * So it opens on click, closes on Escape, on an outside click and on
 * navigation, and shows the twelve top-level categories with their children
 * listed underneath. Every category name is a link — a buyer who wants
 * "Laboratory reagents" should not have to find a separate "view all".
 */
export function CatalogueMenu({
  id,
  categories,
  open,
  onClose,
}: {
  id: string;
  categories: CategoryNode[];
  open: boolean;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (panel.current?.contains(target)) return;
      // The trigger closes the panel itself; without this the click would both
      // close it here and reopen it there, and the menu would never shut.
      if ((target as HTMLElement).closest?.(`[aria-controls="${id}"]`)) return;
      onClose();
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose, id]);

  if (!open) return null;

  return (
    <div
      id={id}
      ref={panel}
      className="medi-z-dropdown animate-fade-in absolute inset-x-0 border-t border-medi-rule bg-white shadow-[0_18px_40px_-24px_oklch(0.255_0.045_243/0.45)]"
    >
      <div className="mx-auto max-w-[80rem] px-4 py-7 sm:px-6 lg:px-8">
        <div className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((category) => {
            const Icon = categoryIcon(category.icon);
            return (
              <div key={category.id}>
                <MedicalLink
                  href={`/medicals/categories/${category.slug}`}
                  onClick={onClose}
                  className="medi-focus group flex items-start gap-2.5 rounded-lg"
                >
                  <Icon
                    className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-medi-teal-600"
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] font-semibold text-medi-ink transition-colors group-hover:text-medi-teal-700">
                      {category.name}
                    </span>
                    <span className="font-figures medi-meta mt-0.5 block text-medi-muted">
                      {category.productCount} {category.productCount === 1 ? "product" : "products"}
                    </span>
                  </span>
                </MedicalLink>

                {category.children.length > 0 ? (
                  <ul className="mt-2.5 space-y-1 border-l border-medi-rule pl-[1.4375rem]">
                    {category.children.map((child) => (
                      <li key={child.id}>
                        <MedicalLink
                          href={`/medicals/categories/${child.slug}`}
                          onClick={onClose}
                          className="medi-focus block rounded text-[0.8125rem] text-medi-body transition-colors hover:text-medi-teal-700"
                        >
                          {child.name}
                        </MedicalLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-7 flex items-center justify-between border-t border-medi-rule pt-5">
          <p className="text-[0.8125rem] text-medi-body">
            Cannot find it? We source to order across Ghana and internationally.
          </p>
          <MedicalLink
            href="/medicals/quotations/new"
            onClick={onClose}
            className="medi-focus group flex items-center gap-1.5 rounded text-[0.8125rem] font-semibold text-medi-teal-700"
          >
            Request a quotation
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden
            />
          </MedicalLink>
        </div>
      </div>
    </div>
  );
}
