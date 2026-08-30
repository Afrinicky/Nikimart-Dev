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
    openingHours: str(fd, "openingHours"),
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
  // An operator account can run only one pickup point (operatorId is unique).
  if (data.operatorId) {
    const taken = await prisma.pickupPoint.findFirst({ where: { operatorId: data.operatorId }, select: { name: true } });
    if (taken) {
      return { error: `That operator already runs “${taken.name}”. Pick a different operator, or leave it as none.`, fieldErrors: { operatorId: "Already assigned." } };
    }
  }

  try {
    await prisma.pickupPoint.create({ data });
  } catch {
    return { error: "Couldn't create the pickup point — its code or operator may already be in use." };
  }
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
  if (data.operatorId) {
    const taken = await prisma.pickupPoint.findFirst({ where: { operatorId: data.operatorId, NOT: { id } }, select: { name: true } });
    if (taken) {
      return { error: `That operator already runs “${taken.name}”. Pick a different operator, or leave it as none.`, fieldErrors: { operatorId: "Already assigned." } };
    }
  }

  try {
    await prisma.pickupPoint.update({ where: { id }, data });
  } catch {
    return { error: "Couldn't save the pickup point — its code or operator may already be in use." };
  }
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
