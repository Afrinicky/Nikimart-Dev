import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";

export interface BannerSlide {
  id: string;
  title: string;
  subtitle: string;
  eventWindow: string;
  ctaLabel: string;
  ctaHref: string;
  image: string | null;
  accentFrom: string;
  accentTo: string;
}

// Fallback slides shown when the DB has no banners yet (or isn't migrated).
//
// Admins pick their own colours per slide; these are only the out-of-the-box
// set, so they are the brand's — orange into black, with one dark slide for
// contrast between them. They used to be a different hue each (orange, green,
// red, blue), which meant the first thing a visitor saw was four unrelated
// colours in sequence, none of them the mark's.
export const DEFAULT_BANNERS: BannerSlide[] = [
  {
    id: "default-1",
    title: "Shop local, preorder global",
    subtitle: "Trusted local shops, campus vendors, and services — all in one place.",
    eventWindow: "",
    ctaLabel: "Shop now",
    ctaHref: "/products",
    image: null,
    accentFrom: "#ff6a00",
    accentTo: "#131313",
  },
  {
    id: "default-2",
    title: "Buy data bundles",
    subtitle: "MTN, Telecel & AirtelTigo data — delivered in seconds.",
    eventWindow: "ALL NETWORKS",
    ctaLabel: "Buy data",
    ctaHref: "/data-bundles",
    image: null,
    accentFrom: "#1f1f1f",
    accentTo: "#131313",
  },
  {
    id: "default-3",
    title: "Flash Sales are live",
    subtitle: "Grab limited-time deals before they're gone.",
    eventWindow: "TODAY ONLY",
    ctaLabel: "See deals",
    ctaHref: "/products?badge=flash_sale",
    image: null,
    accentFrom: "#ff8a3d",
    accentTo: "#7a2e00",
  },
  {
    id: "default-4",
    title: "Shop the world, pick up in Ghana",
    subtitle: "Buy from trusted sellers abroad — we handle freight, customs, and delivery.",
    eventWindow: "",
    ctaLabel: "Global shopping",
    ctaHref: "/shipped-from-abroad",
    image: null,
    accentFrom: "#2e2e2e",
    accentTo: "#131313",
  },
];

/** Active carousel slides for the storefront. Falls back to defaults; resilient
 *  if the Banner table isn't migrated yet (won't crash the homepage). */
export const getBanners = cache(async (): Promise<BannerSlide[]> => {
  try {
    const rows = await prisma.banner.findMany({
      where: { isActive: true },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    if (rows.length) {
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        subtitle: r.subtitle,
        eventWindow: r.eventWindow,
        ctaLabel: r.ctaLabel,
        ctaHref: r.ctaHref,
        image: r.image,
        accentFrom: r.accentFrom,
        accentTo: r.accentTo,
      }));
    }
  } catch {
    // Banner table not migrated yet — use defaults.
  }
  return DEFAULT_BANNERS;
});

/** All banners including inactive ones (admin). Resilient to a missing table. */
export async function getAllBanners() {
  try {
    return await prisma.banner.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] });
  } catch {
    return [];
  }
}
