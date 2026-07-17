"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import type { CrudState } from "@/lib/admin-actions";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function bannerData(fd: FormData) {
  const image = str(fd, "image");
  const color = (key: string, fallback: string) => {
    const v = str(fd, key);
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  };
  return {
    title: str(fd, "title"),
    subtitle: str(fd, "subtitle"),
    eventWindow: str(fd, "eventWindow"),
    ctaLabel: str(fd, "ctaLabel") || "Shop now",
    ctaHref: str(fd, "ctaHref") || "/products",
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

export async function createBanner(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = bannerData(fd);
  if (data.title.length < 2) {
    return { error: "A banner title is required.", fieldErrors: { title: "Required." } };
  }
  await prisma.banner.create({ data });
  revalidateBanners();
  redirect("/admin/banners");
}

export async function updateBanner(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = bannerData(fd);
  if (data.title.length < 2) {
    return { error: "A banner title is required.", fieldErrors: { title: "Required." } };
  }
  await prisma.banner.update({ where: { id }, data });
  revalidateBanners();
  redirect("/admin/banners");
}

export async function deleteBanner(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    await prisma.banner.delete({ where: { id } });
    revalidateBanners();
  }
}
