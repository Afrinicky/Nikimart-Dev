"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ROLES } from "@/lib/roles";
import { buildProductData, parseImages, validateProduct } from "@/lib/product-form";
import { syncProductImages } from "@/lib/product-images";

export type CrudState = { error?: string; fieldErrors?: Record<string, string> };

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function optStr(fd: FormData, key: string): string | undefined {
  const v = str(fd, key);
  return v ? v : undefined;
}
function num(fd: FormData, key: string): number | undefined {
  const v = str(fd, key);
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}
function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
function csv(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function zodErrors(error: z.ZodError): CrudState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors };
}

function revalidateCatalog() {
  revalidatePath("/");
  revalidatePath("/products");
  revalidatePath("/shops");
}

// ===========================================================================
// PRODUCTS
// ===========================================================================

export async function createProduct(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = validateProduct(fd);
  if (!parsed.success) return zodErrors(parsed.error);

  const data = buildProductData(fd);
  const existing = await prisma.product.findUnique({ where: { slug: data.slug } });
  if (existing) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  const product = await prisma.product.create({ data });
  await syncProductImages(product.id, parseImages(fd));
  revalidatePath("/admin/products");
  revalidateCatalog();
  redirect("/admin/products");
}

export async function updateProduct(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = validateProduct(fd);
  if (!parsed.success) return zodErrors(parsed.error);

  const data = buildProductData(fd);
  const clash = await prisma.product.findFirst({ where: { slug: data.slug, NOT: { id } } });
  if (clash) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.product.update({ where: { id }, data });
  await syncProductImages(id, parseImages(fd));
  revalidatePath("/admin/products");
  revalidateCatalog();
  redirect("/admin/products");
}

export async function deleteProduct(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    await prisma.orderItem.deleteMany({ where: { productId: id } });
    await prisma.product.delete({ where: { id } });
    revalidatePath("/admin/products");
    revalidateCatalog();
  }
}

// ===========================================================================
// VENDORS (shops)
// ===========================================================================

const vendorSchema = z.object({
  businessName: z.string().trim().min(2, "Business name is required."),
  description: z.string().trim().min(1, "Description is required."),
});

function vendorData(fd: FormData) {
  const businessName = str(fd, "businessName");
  const initials =
    optStr(fd, "initials") ??
    businessName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("");
  return {
    businessName,
    slug: optStr(fd, "slug") ? slugify(str(fd, "slug")) : slugify(businessName),
    description: str(fd, "description"),
    initials: initials || "NM",
    sellerTypes: JSON.stringify(csv(fd, "sellerTypes").length ? csv(fd, "sellerTypes") : ["local_shop"]),
    accentFrom: optStr(fd, "accentFrom") ?? "#FF8A00",
    accentTo: optStr(fd, "accentTo") ?? "#FFC107",
    locationIds: JSON.stringify(csv(fd, "locationIds").length ? csv(fd, "locationIds") : ["any"]),
    verificationStatus: str(fd, "verificationStatus") || "pending",
    rating: num(fd, "rating") ?? 0,
    reviewCount: num(fd, "reviewCount") ?? 0,
    totalSales: num(fd, "totalSales") ?? 0,
    isOfficial: bool(fd, "isOfficial"),
    deliveryAvailable: bool(fd, "deliveryAvailable"),
    pickupAvailable: bool(fd, "pickupAvailable"),
    sameDayDeliveryAvailable: bool(fd, "sameDayDeliveryAvailable"),
    ownerId: optStr(fd, "ownerId") ?? null,
  };
}

export async function createVendor(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = vendorSchema.safeParse({
    businessName: str(fd, "businessName"),
    description: str(fd, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);

  const data = vendorData(fd);
  const existing = await prisma.vendor.findUnique({ where: { slug: data.slug } });
  if (existing) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.vendor.create({ data });
  revalidatePath("/admin/vendors");
  revalidateCatalog();
  redirect("/admin/vendors");
}

export async function updateVendor(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = vendorSchema.safeParse({
    businessName: str(fd, "businessName"),
    description: str(fd, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);

  const data = vendorData(fd);
  const clash = await prisma.vendor.findFirst({ where: { slug: data.slug, NOT: { id } } });
  if (clash) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.vendor.update({ where: { id }, data });
  revalidatePath("/admin/vendors");
  revalidateCatalog();
  redirect("/admin/vendors");
}

export async function setVendorVerification(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (id && ["pending", "verified", "rejected"].includes(status)) {
    await prisma.vendor.update({ where: { id }, data: { verificationStatus: status } });
    revalidatePath("/admin/vendors");
    revalidateCatalog();
  }
}

export async function deleteVendor(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const productCount = await prisma.product.count({ where: { vendorId: id } });
  if (productCount > 0) {
    // Refuse to orphan products; surfaced via the disabled state in the UI.
    return;
  }
  await prisma.vendor.delete({ where: { id } });
  revalidatePath("/admin/vendors");
  revalidateCatalog();
}

// ===========================================================================
// CATEGORIES
// ===========================================================================

const categorySchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  description: z.string().trim().min(1, "Description is required."),
});

function categoryData(fd: FormData) {
  const name = str(fd, "name");
  return {
    name,
    slug: optStr(fd, "slug") ? slugify(str(fd, "slug")) : slugify(name),
    icon: optStr(fd, "icon") ?? "shopping-bag",
    description: str(fd, "description"),
    productCount: num(fd, "productCount") ?? 0,
  };
}

export async function createCategory(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = categorySchema.safeParse({
    name: str(fd, "name"),
    description: str(fd, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);

  const data = categoryData(fd);
  const existing = await prisma.category.findUnique({ where: { slug: data.slug } });
  if (existing) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.category.create({ data });
  revalidatePath("/admin/categories");
  revalidateCatalog();
  redirect("/admin/categories");
}

export async function updateCategory(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = categorySchema.safeParse({
    name: str(fd, "name"),
    description: str(fd, "description"),
  });
  if (!parsed.success) return zodErrors(parsed.error);

  const data = categoryData(fd);
  const clash = await prisma.category.findFirst({ where: { slug: data.slug, NOT: { id } } });
  if (clash) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.category.update({ where: { id }, data });
  revalidatePath("/admin/categories");
  revalidateCatalog();
  redirect("/admin/categories");
}

export async function deleteCategory(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (!id) return;
  const productCount = await prisma.product.count({ where: { categoryId: id } });
  if (productCount > 0) return; // don't orphan products
  await prisma.category.delete({ where: { id } });
  revalidatePath("/admin/categories");
  revalidateCatalog();
}

// ===========================================================================
// USERS
// ===========================================================================

const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(ROLES),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

const userUpdateSchema = z.object({
  name: z.string().trim().min(2, "Name is required."),
  email: z.string().trim().email("Enter a valid email."),
  role: z.enum(ROLES),
});

export async function createUser(_prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = userCreateSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email"),
    role: str(fd, "role"),
    password: str(fd, "password"),
  });
  if (!parsed.success) return zodErrors(parsed.error);

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Email already registered.", fieldErrors: { email: "Already exists." } };

  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      phone: optStr(fd, "phone") ?? null,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function updateUser(id: string, _prev: CrudState, fd: FormData): Promise<CrudState> {
  await requireAdmin();
  const parsed = userUpdateSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email"),
    role: str(fd, "role"),
  });
  if (!parsed.success) return zodErrors(parsed.error);

  const email = parsed.data.email.toLowerCase();
  const clash = await prisma.user.findFirst({ where: { email, NOT: { id } } });
  if (clash) return { error: "Email already registered.", fieldErrors: { email: "Already exists." } };

  const password = optStr(fd, "password");
  if (password && password.length < 8) {
    return { error: "Password too short.", fieldErrors: { password: "At least 8 characters." } };
  }

  await prisma.user.update({
    where: { id },
    data: {
      name: parsed.data.name,
      email,
      role: parsed.data.role,
      phone: optStr(fd, "phone") ?? null,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    },
  });
  revalidatePath("/admin/users");
  redirect("/admin/users");
}

export async function deleteUser(fd: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  if (!id || id === admin.id) return; // never delete yourself
  await prisma.user.delete({ where: { id } });
  revalidatePath("/admin/users");
}

// ===========================================================================
// ORDERS
// ===========================================================================

const ORDER_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"];

export async function setOrderStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (id && ORDER_STATUSES.includes(status)) {
    await prisma.order.update({ where: { id }, data: { status } });
    revalidatePath("/admin/orders");
    revalidatePath("/account");
  }
}

export async function deleteOrder(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id");
  if (id) {
    await prisma.order.delete({ where: { id } });
    revalidatePath("/admin/orders");
  }
}
