"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { removeForwarder, writeForwarder, type ForwarderInput } from "@/lib/forwarder-save";

/**
 * A freight forwarder, saved whole.
 *
 * Registering one used to be four screens in sequence — create the company,
 * then its classes, then its lanes, then a price per class per lane — and the
 * order mattered, because a price needs a class and a class needs a company.
 * Anybody who stopped halfway left a forwarder who could not quote.
 *
 * So the whole profile is one form and one transaction. The client posts
 * everything it knows: who they are, their Ghana warehouses, the classes of
 * goods down the side of their grid, the modes across the top, and a rate per
 * cubic metre in each cell. New rows and columns carry a client-side `key`
 * instead of an id; `lib/forwarder-save` resolves those keys to real ids as it
 * writes, which is what lets a grid be filled in before anything exists.
 *
 * This module is only the door: check who is asking, hand the payload over,
 * tell the caches. The rules live in `lib/forwarder-save`, where they can be
 * read and tested without an admin session in the way.
 */

export type ForwarderState = { ok?: boolean; error?: string; id?: string };

/** Read the payload the form posts as one JSON field. */
function parsePayload(raw: string): ForwarderInput | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ForwarderInput;
  } catch {
    return null;
  }
}

function revalidateShipping() {
  revalidatePath("/admin/shipping", "layout");
  revalidatePath("/admin/purchasing", "layout");
  revalidatePath("/checkout");
  revalidatePath("/cart");
  revalidatePath("/shipped-from-abroad");
  revalidatePath("/products", "layout");
}

/**
 * Create or replace one forwarder's whole profile.
 *
 * `id` empty creates. Anything the payload leaves out is deleted — that is the
 * point of saving a whole profile: what is on the screen is what the forwarder
 * is.
 */
export async function saveForwarder(
  id: string,
  _prev: ForwarderState,
  fd: FormData,
): Promise<ForwarderState> {
  await requireAdmin();

  const input = parsePayload(String(fd.get("payload") ?? ""));
  if (!input) return { error: "Couldn't read the form. Reload the page and try again." };

  const result = await writeForwarder(id, input);
  if (!result.ok) return { error: result.error };

  revalidateShipping();
  return { ok: true, id: result.id };
}

/**
 * Delete a forwarder outright.
 *
 * Deactivating instead was the old behaviour and it was the wrong one: an admin
 * who deletes a forwarder means the company is gone, and leaving a hidden row
 * behind meant its code stayed taken and its warehouses stayed in the database.
 *
 * A failure is reported rather than swallowed. The button used to go grey and
 * the row used to stay where it was, with nothing anywhere saying why.
 */
export async function deleteForwarder(fd: FormData): Promise<{ error?: string } | void> {
  await requireAdmin();
  const id = String(fd.get("id") ?? "").trim();
  if (!id) return { error: "Nothing was selected to delete." };

  const result = await removeForwarder(id);
  revalidateShipping();
  return result.ok ? undefined : { error: `Couldn't delete: ${result.error}` };
}
