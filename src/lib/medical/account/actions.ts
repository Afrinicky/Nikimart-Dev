"use server";

import { revalidatePath } from "next/cache";
import { medicalDb } from "@/lib/medical/db";
import { ensureMedicalCustomer, medicalCustomer } from "@/lib/medical/customer";

/**
 * What a signed-in customer can change about their own account.
 *
 * Nothing here takes a customer id from the browser: the customer is whoever
 * the session says it is, resolved on the server on every call. An action that
 * accepted an id would be an action anybody could point at anybody.
 */

export type AccountResult =
  | { ok: true; saved: boolean }
  | { ok: false; error: string; needsSignIn?: boolean };

/**
 * Save a product, or unsave it. One action rather than two, because the button
 * is one control with two states and a round trip that returns the new state
 * is what lets the button settle on the truth rather than on its own guess.
 */
export async function toggleSavedProduct(productId: string): Promise<AccountResult> {
  const id = productId.trim();
  if (!id) return { ok: false, error: "No product given." };

  const customer = await ensureMedicalCustomer();
  if (!customer) {
    return { ok: false, error: "Sign in to save products.", needsSignIn: true };
  }

  try {
    // The product is checked rather than taken on trust: a saved row pointing
    // at something unlistable would be a saved page that renders nothing and
    // cannot be cleared.
    const product = await medicalDb.medicalProduct.findFirst({
      where: { id, status: "ACTIVE" },
      select: { id: true },
    });
    if (!product) return { ok: false, error: "That product is no longer listed." };

    const existing = await medicalDb.wishlistItem.findUnique({
      where: { customerId_productId: { customerId: customer.customerId, productId: id } },
      select: { id: true },
    });

    if (existing) {
      await medicalDb.wishlistItem.delete({ where: { id: existing.id } });
      revalidatePath("/medicals/account/saved");
      return { ok: true, saved: false };
    }

    await medicalDb.wishlistItem.create({
      data: { customerId: customer.customerId, productId: id },
    });
    revalidatePath("/medicals/account/saved");
    return { ok: true, saved: true };
  } catch {
    return { ok: false, error: "That could not be saved. Try again." };
  }
}

/**
 * Whether this product is already saved.
 *
 * Asked by the save control after it mounts, rather than rendered into the
 * page. The product page is cached for a minute and shared by everyone who
 * opens it — reading the session there would make it per-visitor, and pay for
 * a heart icon with the catalogue's cache. A visitor who is not signed in is
 * answered without touching the database.
 *
 * Read-only: it must not be the thing that creates somebody's customer record.
 */
export async function savedProductState(productId: string): Promise<{ saved: boolean }> {
  const id = productId.trim();
  if (!id) return { saved: false };

  const customer = await medicalCustomer();
  if (!customer) return { saved: false };

  try {
    const row = await medicalDb.wishlistItem.findUnique({
      where: { customerId_productId: { customerId: customer.customerId, productId: id } },
      select: { id: true },
    });
    return { saved: Boolean(row) };
  } catch {
    return { saved: false };
  }
}
