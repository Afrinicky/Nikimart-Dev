"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { buildProductData, parseImages, validateProduct } from "@/lib/product-form";
import { syncProductImages } from "@/lib/product-images";
import type { CrudState } from "@/lib/admin-actions";

/** The vendor (shop) owned by the current seller, or null. */
async function currentVendor() {
  const user = await requireUser();
  if (user.role !== "SELLER" && user.role !== "ADMIN") return null;
  const vendor = await prisma.vendor.findFirst({ where: { ownerId: user.id } });
  return vendor;
}

function zodErrors(error: z.ZodError): CrudState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors };
}

function revalidate() {
  revalidatePath("/seller/products");
  revalidatePath("/seller");
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/shops");
}

export async function createSellerProduct(_prev: CrudState, fd: FormData): Promise<CrudState> {
  const vendor = await currentVendor();
  if (!vendor) return { error: "You don't have a shop yet. Register one first." };

  const parsed = validateProduct(fd);
  if (!parsed.success) return zodErrors(parsed.error);

  const data = buildProductData(fd, vendor.id);
  const existing = await prisma.product.findUnique({ where: { slug: data.slug } });
  if (existing) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  const product = await prisma.product.create({ data });
  await syncProductImages(product.id, parseImages(fd));
  revalidate();
  redirect("/seller/products");
}

export async function updateSellerProduct(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  const vendor = await currentVendor();
  if (!vendor) return { error: "You don't have a shop." };

  const product = await prisma.product.findUnique({ where: { id }, select: { vendorId: true } });
  if (!product || product.vendorId !== vendor.id) return { error: "That product isn't in your shop." };

  const parsed = validateProduct(fd);
  if (!parsed.success) return zodErrors(parsed.error);

  const data = buildProductData(fd, vendor.id);
  const clash = await prisma.product.findFirst({ where: { slug: data.slug, NOT: { id } } });
  if (clash) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.product.update({ where: { id }, data });
  await syncProductImages(id, parseImages(fd));
  revalidate();
  redirect("/seller/products");
}

export async function deleteSellerProduct(fd: FormData): Promise<void> {
  const vendor = await currentVendor();
  if (!vendor) return;
  const id = String(fd.get("id") ?? "");
  const product = await prisma.product.findUnique({ where: { id }, select: { vendorId: true } });
  if (!product || product.vendorId !== vendor.id) return;

  await prisma.orderItem.deleteMany({ where: { productId: id } });
  await prisma.product.delete({ where: { id } });
  revalidate();
}

export type SellerShopState = CrudState & { ok?: boolean };

/** Update the signed-in seller's own shop profile + delivery options. */
export async function updateSellerShop(_prev: SellerShopState, fd: FormData): Promise<SellerShopState> {
  const vendor = await currentVendor();
  if (!vendor) return { error: "You don't have a shop to edit yet." };

  const businessName = String(fd.get("businessName") ?? "").trim();
  const description = String(fd.get("description") ?? "").trim();
  if (businessName.length < 2) {
    return { error: "Shop name is required.", fieldErrors: { businessName: "Required." } };
  }

  try {
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        businessName,
        description,
        deliveryAvailable: fd.get("deliveryAvailable") === "on",
        pickupAvailable: fd.get("pickupAvailable") === "on",
        sameDayDeliveryAvailable: fd.get("sameDayDeliveryAvailable") === "on",
      },
    });
  } catch {
    return { error: "Couldn't save your shop. Please try again." };
  }

  revalidatePath("/seller/settings");
  revalidatePath("/seller");
  revalidatePath("/shops");
  return { ok: true };
}
