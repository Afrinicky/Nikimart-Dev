"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import type { CrudState } from "@/lib/admin-actions";

const TYPES = ["city", "town", "campus", "institution", "community"];

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function data(fd: FormData) {
  const type = str(fd, "type");
  const zone = Number(str(fd, "deliveryZoneMultiplier"));
  return {
    name: str(fd, "name"),
    type: TYPES.includes(type) ? type : "city",
    region: str(fd, "region"),
    isActive: fd.get("isActive") === "on",
    order: Number(str(fd, "order")) || 0,
    deliveryZoneMultiplier: Number.isFinite(zone) && zone > 0 ? zone : 1,
  };
}

function revalidateLocations() {
  revalidatePath("/", "layout");
  revalidatePath("/admin/locations");
}

export async function createLocation(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const d = data(fd);
  if (d.name.length < 2 || d.region.length < 2) {
    return { error: "Name and region are required." };
  }
  await prisma.location.create({ data: d });
  revalidateLocations();
  redirect("/admin/locations");
}

export async function updateLocation(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const d = data(fd);
  if (d.name.length < 2 || d.region.length < 2) {
    return { error: "Name and region are required." };
  }
  await prisma.location.update({ where: { id }, data: d });
  revalidateLocations();
  redirect("/admin/locations");
}

export async function deleteLocation(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id && id !== "any") {
    await prisma.location.delete({ where: { id } });
    revalidateLocations();
  }
}
