"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import { termsAccepted, TERMS_REQUIRED_MESSAGE } from "@/lib/terms";
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

  const data = buildProductData(fd, { vendorId: vendor.id, actor: "seller" });
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

  const data = buildProductData(fd, { vendorId: vendor.id, actor: "seller" });
  const clash = await prisma.product.findFirst({ where: { slug: data.slug, NOT: { id } } });
  if (clash) return { error: "Slug already in use.", fieldErrors: { slug: "Already exists." } };

  await prisma.product.update({ where: { id }, data });
  await syncProductImages(id, parseImages(fd));
  revalidate();
  redirect("/seller/products");
}

/**
 * Take a product off the storefront. Products with sales are archived rather
 * than deleted — deleting one would drag its order items with it and quietly
 * rewrite past orders, settlements, and commission totals.
 */
export async function deleteSellerProduct(fd: FormData): Promise<void> {
  const vendor = await currentVendor();
  if (!vendor) return;
  const id = String(fd.get("id") ?? "");
  const product = await prisma.product.findUnique({ where: { id }, select: { vendorId: true } });
  if (!product || product.vendorId !== vendor.id) return;

  const sold = await prisma.orderItem.count({ where: { productId: id } });
  if (sold > 0) {
    await prisma.product.update({
      where: { id },
      data: { isArchived: true, affiliateEnabled: false, affiliateEnrolledBy: "" },
    });
  } else {
    await prisma.product.delete({ where: { id } });
  }
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
    const s = (k: string) => String(fd.get(k) ?? "").trim();
    const payoutMethod = s("payoutMethod");
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        businessName,
        description,
        deliveryAvailable: fd.get("deliveryAvailable") === "on",
        pickupAvailable: fd.get("pickupAvailable") === "on",
        sameDayDeliveryAvailable: fd.get("sameDayDeliveryAvailable") === "on",
        payoutMethod: payoutMethod === "momo" || payoutMethod === "bank" ? payoutMethod : "",
        momoNumber: s("momoNumber"),
        momoName: s("momoName"),
        bankName: s("bankName"),
        bankAccountName: s("bankAccountName"),
        bankAccountNumber: s("bankAccountNumber"),
        consolidationPointId: s("consolidationPointId") || null,
        logoUrl: s("logoUrl"),
        bannerUrl: s("bannerUrl"),
        whatsapp: s("whatsapp"),
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

// --- Shop registration ----------------------------------------------------

export type VendorRegisterState = CrudState;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Find a shop slug that isn't taken yet, appending -2, -3… on a clash. */
async function uniqueVendorSlug(base: string): Promise<string> {
  const root = slugify(base) || "shop";
  let slug = root;
  let n = 2;
  // Bounded loop — practically resolves on the first or second try.
  while (await prisma.vendor.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${root}-${n++}`;
  }
  return slug;
}

const SELLER_TYPE_VALUES = new Set<string>([
  "local_shop",
  "preorder_seller",
  "campus_vendor",
  "food_vendor",
  "service_provider",
  "wholesale_supplier",
  "official_partner",
]);

/**
 * Register a shop for the signed-in user: creates the Vendor (owned by the
 * user), stores payout/payment details, promotes the user to SELLER, and
 * refreshes the session so they can reach the seller dashboard immediately.
 */
export async function registerVendor(_prev: VendorRegisterState, fd: FormData): Promise<VendorRegisterState> {
  const user = await requireUser();

  // One shop per account for now.
  const already = await prisma.vendor.findFirst({ where: { ownerId: user.id }, select: { id: true } });
  if (already) redirect("/seller");

  const s = (k: string) => String(fd.get(k) ?? "").trim();

  const businessName = s("businessName");
  const description = s("description");
  const sellerType = s("sellerType");
  const phone = s("phone");
  const location = s("location");
  const payoutMethod = s("payoutMethod");

  const fieldErrors: Record<string, string> = {};
  if (!termsAccepted(fd)) fieldErrors.acceptTerms = TERMS_REQUIRED_MESSAGE;
  if (businessName.length < 2) fieldErrors.businessName = "Enter your shop name.";
  if (!SELLER_TYPE_VALUES.has(sellerType)) fieldErrors.sellerType = "Choose a seller type.";
  if (description.length < 10) fieldErrors.description = "Tell buyers a little about your shop (10+ characters).";
  if (!phone) fieldErrors.phone = "A contact phone number is required.";

  // Payment / payout details — this is how the seller gets paid.
  const momoNumber = s("momoNumber");
  const momoName = s("momoName");
  const bankName = s("bankName");
  const bankAccountName = s("bankAccountName");
  const bankAccountNumber = s("bankAccountNumber");

  if (payoutMethod !== "momo" && payoutMethod !== "bank") {
    fieldErrors.payoutMethod = "Choose how you'd like to get paid.";
  } else if (payoutMethod === "momo") {
    if (!momoNumber) fieldErrors.momoNumber = "Enter your Mobile Money number.";
    if (!momoName) fieldErrors.momoName = "Enter the name on the MoMo account.";
  } else {
    if (!bankName) fieldErrors.bankName = "Enter your bank name.";
    if (!bankAccountNumber) fieldErrors.bankAccountNumber = "Enter your account number.";
    if (!bankAccountName) fieldErrors.bankAccountName = "Enter the account holder's name.";
  }

  if (Object.keys(fieldErrors).length) {
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }

  const initials =
    businessName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "NM";

  try {
    const slug = await uniqueVendorSlug(businessName);
    await prisma.vendor.create({
      data: {
        businessName,
        slug,
        description,
        initials,
        sellerTypes: JSON.stringify([sellerType]),
        accentFrom: "#FF6A00",
        accentTo: "#FFB020",
        locationIds: JSON.stringify(location ? [location] : ["any"]),
        originCountry: "GH",
        verificationStatus: "pending",
        deliveryAvailable: fd.get("deliveryAvailable") === "on",
        pickupAvailable: fd.get("pickupAvailable") === "on",
        sameDayDeliveryAvailable: fd.get("sameDayDeliveryAvailable") === "on",
        payoutMethod,
        momoNumber,
        momoName,
        bankName,
        bankAccountName,
        bankAccountNumber,
        consolidationPointId: s("consolidationPointId") || null,
        ownerId: user.id,
        termsAcceptedAt: new Date(),
      },
    });

    // Promote the account to SELLER and record the contact phone. The sign-in
    // email is deliberately left alone: this form doesn't verify ownership of
    // the address, so letting it rewrite the login identity would turn shop
    // registration into an unverified email-change endpoint. The business email
    // entered here is shop contact detail, not a credential.
    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: user.role === "ADMIN" ? "ADMIN" : "SELLER",
        ...(phone ? { phone } : {}),
      },
    });
  } catch {
    return { error: "Couldn't register your shop. Please try again." };
  }

  // Refresh the JWT so the new SELLER role takes effect without a re-login.
  if (user.role !== "ADMIN") {
    const { unstable_update } = await import("@/lib/auth");
    await unstable_update({ role: "SELLER" } as never);
  }

  revalidatePath("/seller");
  revalidatePath("/shops");
  redirect("/seller");
}

export type PayoutRequestState = { ok?: boolean; error?: string };

/** Seller requests a payout of up to their available balance. */
export async function requestSellerPayout(_prev: PayoutRequestState, fd: FormData): Promise<PayoutRequestState> {
  const vendor = await currentVendor();
  if (!vendor) return { error: "You don't have a shop." };
  if (!vendor.payoutMethod) {
    return { error: "Add your payout details (Mobile Money or bank) in Shop settings first." };
  }

  const value = Number(String(fd.get("amount") ?? "").trim());
  if (!(value > 0)) return { error: "Enter an amount greater than zero." };

  const { getSellerEarnings } = await import("@/lib/seller");
  const earnings = await getSellerEarnings(vendor.id);
  if (value > earnings.available + 0.005) {
    return { error: `You can request up to ${earnings.available}.` };
  }

  const method = vendor.payoutMethod === "bank" ? "Bank transfer" : "Mobile Money";
  const detail =
    vendor.payoutMethod === "bank"
      ? `${vendor.bankName} · ${vendor.bankAccountNumber} · ${vendor.bankAccountName}`
      : `${vendor.momoNumber} · ${vendor.momoName}`;
  try {
    // One open request at a time — two submissions racing the balance check
    // above would otherwise both pass and together exceed the cleared balance.
    const openRequest = await prisma.payout.findFirst({
      where: { vendorId: vendor.id, status: "pending" },
      select: { id: true },
    });
    if (openRequest) {
      return { error: "You already have a payout request awaiting review." };
    }
    await prisma.payout.create({
      data: {
        vendorId: vendor.id,
        amount: Math.round(value * 100) / 100,
        status: "pending",
        method,
        note: `Requested by seller — ${detail}`,
      },
    });
  } catch {
    return { error: "Couldn't submit your request. Please try again." };
  }
  revalidatePath("/seller/settlements");
  revalidatePath("/seller");
  revalidatePath("/admin/finance");
  return { ok: true };
}
