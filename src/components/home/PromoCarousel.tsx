"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import type { BannerSlide } from "@/lib/banners";

/**
 * Jumia-style promotional carousel. The active slide dominates the width while
 * the next slide peeks in from the right on mobile to invite swiping. Includes
 * pagination dots, autoplay, and prev/next arrows on larger screens.
 */
export function PromoCarousel({ slides }: { slides: BannerSlide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const count = slides.length;

  const goTo = (i: number, smooth = true) => {
    const track = trackRef.current;
    if (!track || count === 0) return;
    const idx = ((i % count) + count) % count;
    const child = track.children[idx] as HTMLElement | undefined;
    if (child) track.scrollTo({ left: child.offsetLeft, behavior: smooth ? "smooth" : "auto" });
  };

  // Track the active slide from the scroll position.
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const children = Array.from(track.children) as HTMLElement[];
        let nearest = 0;
        let best = Infinity;
        for (let i = 0; i < children.length; i++) {
          const d = Math.abs(children[i].offsetLeft - track.scrollLeft);
          if (d < best) {
            best = d;
            nearest = i;
          }
        }
        activeRef.current = nearest;
        setActive(nearest);
      });
    };
    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      track.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Autoplay (only with more than one slide).
  useEffect(() => {
    if (count <= 1) return;
    const id = setInterval(() => goTo(activeRef.current + 1), 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="scrollbar-none flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
      >
        {slides.map((s) => (
          <Link
            key={s.id}
            href={s.ctaHref}
            className="group relative flex h-44 w-[88%] shrink-0 snap-start overflow-hidden rounded-2xl sm:h-52 lg:h-60 lg:w-full"
            style={{ background: `linear-gradient(135deg, ${s.accentFrom}, ${s.accentTo})` }}
          >
            <div className="relative z-10 flex max-w-[62%] flex-col justify-center gap-2 p-5 sm:p-7 lg:max-w-[56%]">
              {s.eventWindow ? (
                <span className="w-fit rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white sm:text-xs">
                  {s.eventWindow}
                </span>
              ) : null}
              <h2 className="font-display text-lg font-bold leading-tight text-white sm:text-2xl lg:text-[1.9rem]">
                {s.title}
              </h2>
              {s.subtitle ? (
                <p className="hidden text-xs text-white/80 sm:line-clamp-2 sm:block sm:text-sm">
                  {s.subtitle}
                </p>
              ) : null}
              <span className="mt-1 flex w-fit items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-niki-navy transition-transform group-hover:translate-x-0.5 sm:text-sm">
                {s.ctaLabel}
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
            {s.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.image}
                alt=""
                className="absolute right-0 top-0 h-full w-[44%] object-cover object-center"
              />
            ) : null}
          </Link>
        ))}
      </div>

      {count > 1 ? (
        <>
          {/* Dots */}
          <div className="mt-2.5 flex justify-center gap-1.5">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === active ? "w-5 bg-niki-orange" : "w-1.5 bg-niki-ink/20 hover:bg-niki-ink/40"
                }`}
              />
            ))}
          </div>

          {/* Desktop arrows */}
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => goTo(active - 1)}
            className="absolute left-2 top-[calc(50%-1rem)] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-niki-ink shadow-md ring-1 ring-black/5 transition-colors hover:bg-white lg:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => goTo(active + 1)}
            className="absolute right-2 top-[calc(50%-1rem)] hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-niki-ink shadow-md ring-1 ring-black/5 transition-colors hover:bg-white lg:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : null}
    </div>
  );
}
