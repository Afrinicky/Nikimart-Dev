"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { isSafeImageUrl } from "@/lib/product-form";
import type { CrudState } from "@/lib/admin-actions";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** A link target we're willing to render: a site path or an http(s) URL. */
function safeHref(value: string): string {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return "/products";
}

function bannerData(fd: FormData) {
  const rawImage = str(fd, "image");
  const image = isSafeImageUrl(rawImage) ? rawImage : "";
  const color = (key: string, fallback: string) => {
    const v = str(fd, key);
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  };
  return {
    title: str(fd, "title"),
    subtitle: str(fd, "subtitle"),
    eventWindow: str(fd, "eventWindow"),
    ctaLabel: str(fd, "ctaLabel") || "Shop now",
    // Only same-site paths and absolute http(s) links — never `javascript:`
    // or a protocol-relative URL, both of which end up in an anchor href.
    ctaHref: safeHref(str(fd, "ctaHref")),
    image: image || null,
    accentFrom: color("accentFrom", "#ff7a1a"),
    accentTo: color("accentTo", "#0e1f36"),
    isActive: fd.get("isActive") === "on",
    order: Number(str(fd, "order")) || 0,
  };
}

function revalidateBanners() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/banners");
}

const STORAGE_ERROR =
  "Couldn't save the banner — the carousel storage isn't set up on this database yet. Run the Neon catch-up SQL (nikimart-neon-carousel.sql), then try again.";

export async function createBanner(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = bannerData(fd);
  if (data.title.length < 2) {
    return { error: "A banner title is required.", fieldErrors: { title: "Required." } };
  }
  try {
    await prisma.banner.create({ data });
  } catch {
    return { error: STORAGE_ERROR };
  }
  revalidateBanners();
  redirect("/admin/banners"); // outside try — redirect() throws NEXT_REDIRECT
}

export async function updateBanner(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = bannerData(fd);
  if (data.title.length < 2) {
    return { error: "A banner title is required.", fieldErrors: { title: "Required." } };
  }
  try {
    await prisma.banner.update({ where: { id }, data });
  } catch {
    return { error: STORAGE_ERROR };
  }
  revalidateBanners();
  redirect("/admin/banners"); // outside try — redirect() throws NEXT_REDIRECT
}

export async function deleteBanner(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    try {
      await prisma.banner.delete({ where: { id } });
      revalidateBanners();
    } catch {
      // Table missing or row already gone — nothing to do.
    }
  }
}
