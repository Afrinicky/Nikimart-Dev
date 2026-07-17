"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import type { CrudState } from "@/lib/admin-actions";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function pickupData(fd: FormData) {
  return {
    name: str(fd, "name"),
    code: str(fd, "code").toUpperCase().replace(/\s+/g, "-"),
    locationName: str(fd, "locationName"),
    address: str(fd, "address"),
    isActive: fd.get("isActive") === "on",
    operatorId: str(fd, "operatorId") || null,
  };
}

function revalidatePickups() {
  revalidatePath("/admin/pickup-points");
  revalidatePath("/pickup-points");
  revalidatePath("/checkout");
}

export async function createPickupPoint(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = pickupData(fd);
  if (data.name.length < 2 || data.code.length < 2 || data.address.length < 3) {
    return { error: "Name, code, and address are required." };
  }
  const clash = await prisma.pickupPoint.findUnique({ where: { code: data.code } });
  if (clash) return { error: "Code already in use.", fieldErrors: { code: "Already exists." } };

  await prisma.pickupPoint.create({ data });
  revalidatePickups();
  redirect("/admin/pickup-points");
}

export async function updatePickupPoint(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const data = pickupData(fd);
  if (data.name.length < 2 || data.code.length < 2 || data.address.length < 3) {
    return { error: "Name, code, and address are required." };
  }
  const clash = await prisma.pickupPoint.findFirst({ where: { code: data.code, NOT: { id } } });
  if (clash) return { error: "Code already in use.", fieldErrors: { code: "Already exists." } };

  await prisma.pickupPoint.update({ where: { id }, data });
  revalidatePickups();
  redirect("/admin/pickup-points");
}

export async function deletePickupPoint(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const orderCount = await prisma.order.count({ where: { pickupPointId: id } });
  if (orderCount > 0) {
    // Don't orphan orders; deactivate instead of hard-deleting.
    await prisma.pickupPoint.update({ where: { id }, data: { isActive: false } });
  } else {
    await prisma.pickupPoint.delete({ where: { id } });
  }
  revalidatePickups();
}
