"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dataDb } from "@/lib/data-db";
import { requireDataAdminAction } from "@/lib/data-bundles/session";
import { saveDataSettings } from "@/lib/data-bundles/settings";
import { creditServiceCommission, voidServiceCommission } from "@/lib/data-bundles/agent-ledger";
import { isServiceStatus } from "@/lib/data-bundles/service-orders";
import {
  MAX_SERVICE_FIELDS,
  MAX_SERVICE_SPEEDS,
  resolveServiceFields,
  resolveServiceSpeeds,
  variantIsOrderable,
} from "@/lib/data-bundles/service-fields";

/**
 * The admin's half of the services shelf.
 *
 * Everything an administrator can change about what is for sale, what it
 * costs, where it is shown and what happens to an order after it is paid for.
 * Every one of these guards with `requireDataAdminAction()`: they set prices
 * and move commission, so a stale session must never reach one.
 *
 * The editor posts the whole service — its questions, its variants and their
 * speed options — as one form. Variants are matched by id and anything absent
 * is deleted, which is what lets one screen edit a service rather than four.
 * An order that already quotes a variant keeps its own snapshot of the name
 * and the price, so deleting one never rewrites what somebody bought.
 */

export type ServiceAdminState = { ok?: boolean; error?: string; message?: string };

/** Roughly 3MB of base64 — far more than the browser ever sends. */
const MAX_IMAGE_CHARS = 4_000_000;

const STORAGE_ERROR =
  "Couldn't save — the services tables aren't set up on this database yet. " +
  "Run the data migrations, then try again.";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function num(fd: FormData, key: string, fallback = 0): number {
  const n = Number(str(fd, key));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function refresh() {
  revalidatePath("/admin/data/products");
  revalidatePath("/admin/data/products/orders");
  revalidatePath("/admin/data");
  revalidatePath("/data-bundles");
  revalidatePath("/agent/products");
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/** One variant, as the editor posts it. */
interface PostedVariant {
  id: string;
  name: string;
  description: string;
  price: number;
  agentPrice: number;
  turnaround: string;
  standardEnabled: boolean;
  speeds: string;
  fields: string;
  isActive: boolean;
  order: number;
}

function readVariants(fd: FormData): PostedVariant[] {
  const raw = str(fd, "variants");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
    .map((v, i) => ({
      id: typeof v.id === "string" ? v.id : "",
      name: String(v.name ?? "").trim().slice(0, 120),
      description: String(v.description ?? "").trim().slice(0, 400),
      price: Math.max(0, Number(v.price) || 0),
      agentPrice: Math.max(0, Number(v.agentPrice) || 0),
      turnaround: String(v.turnaround ?? "").trim().slice(0, 80),
      standardEnabled: v.standardEnabled !== false,
      // Re-resolved rather than trusted: the editor is a browser, and this is
      // the only side that decides what a stored speed or field may say.
      speeds: JSON.stringify(resolveServiceSpeeds(v.speeds).slice(0, MAX_SERVICE_SPEEDS)),
      fields: JSON.stringify(resolveServiceFields(v.fields).slice(0, MAX_SERVICE_FIELDS)),
      isActive: v.isActive !== false,
      order: Number.isFinite(Number(v.order)) ? Number(v.order) : i + 1,
    }))
    .filter((v) => v.name !== "");
}

/**
 * Create or update one service, with everything it contains.
 *
 * Every failure returns a message. Nothing is allowed to throw out of here:
 * an uncaught error in a server action reaches the client as a rejected
 * promise and lands on the console's error boundary, which is how saving a
 * product turned into a full-page "something went wrong" with a digest and no
 * way back to the form. A save that cannot happen should say so above the
 * form, with the form still filled in.
 */
export async function saveService(
  _state: ServiceAdminState,
  fd: FormData,
): Promise<ServiceAdminState> {
  try {
    return await writeService(fd);
  } catch (err) {
    // NEXT_REDIRECT is how redirect() travels; it must pass through.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(
      `[services] saving a product failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
    );
    return {
      error:
        err instanceof Error && err.message
          ? `Couldn't save: ${err.message}`
          : "Couldn't save the product. Please try again.",
    };
  }
}

async function writeService(fd: FormData): Promise<ServiceAdminState> {
  await requireDataAdminAction();

  const id = str(fd, "id");
  const name = str(fd, "name");
  if (!name) return { error: "Give the service a name." };

  const slug = slugify(str(fd, "slug") || name);
  if (slug.length < 3) return { error: "The web address needs at least three characters." };

  const variants = readVariants(fd);
  if (variants.length === 0) {
    return { error: "Add at least one option — a service with nothing to choose cannot be sold." };
  }

  // An option with the ordinary speed switched off and no faster lane open is
  // one nobody can order. Caught here rather than left to puzzle somebody at
  // the checkout.
  const unorderable = variants.find(
    (v) =>
      v.isActive &&
      !variantIsOrderable({
        standardEnabled: v.standardEnabled,
        speeds: resolveServiceSpeeds(v.speeds),
      }),
  );
  if (unorderable) {
    return {
      error: `"${unorderable.name}" has no speed anybody can choose. Switch the standard speed back on, or open one of its faster options.`,
    };
  }

  // A data URL is the heaviest thing in this form by an order of magnitude,
  // and a request over the server-action body limit never reaches this
  // function at all — it fails upstream with nothing useful to show. The
  // browser downscales before posting; this is the backstop that names the
  // problem if one ever arrives anyway.
  const imageUrl = str(fd, "imageUrl");
  if (imageUrl.length > MAX_IMAGE_CHARS) {
    return {
      error: "That picture is too large. Please use a smaller image and save again.",
    };
  }

  const data = {
    slug,
    name: name.slice(0, 120),
    tagline: str(fd, "tagline").slice(0, 160),
    summary: str(fd, "summary").slice(0, 1200),
    imageUrl,
    icon: str(fd, "icon").slice(0, 8) || "📄",
    accentFrom: str(fd, "accentFrom") || "#ff6a00",
    accentTo: str(fd, "accentTo") || "#ff9a3d",
    fields: JSON.stringify(resolveServiceFields(str(fd, "fields")).slice(0, MAX_SERVICE_FIELDS)),
    terms: str(fd, "terms").slice(0, 4000),
    isActive: fd.get("isActive") !== null,
    onStore: fd.get("onStore") !== null,
    order: Math.round(num(fd, "order", 0)),
  };

  try {
    const clash = await dataDb.dataService.findUnique({ where: { slug }, select: { id: true } });
    if (clash && clash.id !== id) {
      return { error: "Another service already uses that web address." };
    }

    const service = id
      ? await dataDb.dataService.update({ where: { id }, data })
      : await dataDb.dataService.create({ data });

    // Variants: update what came back with an id, create what did not, delete
    // what the editor no longer holds.
    const keep: string[] = [];
    for (const v of variants) {
      const payload = {
        name: v.name,
        description: v.description,
        price: v.price,
        agentPrice: v.agentPrice,
        turnaround: v.turnaround,
        standardEnabled: v.standardEnabled,
        speeds: v.speeds,
        fields: v.fields,
        isActive: v.isActive,
        order: v.order,
      };
      if (v.id) {
        const existing = await dataDb.dataServiceVariant.findFirst({
          where: { id: v.id, serviceId: service.id },
          select: { id: true },
        });
        if (existing) {
          await dataDb.dataServiceVariant.update({ where: { id: v.id }, data: payload });
          keep.push(v.id);
          continue;
        }
      }
      const created = await dataDb.dataServiceVariant.create({
        data: { ...payload, serviceId: service.id },
      });
      keep.push(created.id);
    }
    await dataDb.dataServiceVariant.deleteMany({
      where: { serviceId: service.id, id: { notIn: keep } },
    });

    refresh();
  } catch (err) {
    console.error(
      `[services] writing product ${id || "(new)"} failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`,
    );
    return { error: STORAGE_ERROR };
  }

  redirect("/admin/data/products");
}

/** Suspend or reopen a service without losing anything it holds. */
export async function toggleService(fd: FormData): Promise<void> {
  await requireDataAdminAction();
  const id = str(fd, "id");
  if (!id) return;
  try {
    const row = await dataDb.dataService.findUnique({ where: { id }, select: { isActive: true } });
    if (!row) return;
    await dataDb.dataService.update({ where: { id }, data: { isActive: !row.isActive } });
    refresh();
  } catch {
    // not migrated — nothing to toggle
  }
}

/**
 * Delete a service for good.
 *
 * Orders keep their own copy of the name, the option and the price, so an old
 * order still reads correctly afterwards — what goes is the listing, not the
 * history.
 */
export async function deleteService(fd: FormData): Promise<void> {
  await requireDataAdminAction();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await dataDb.dataService.delete({ where: { id } });
    refresh();
  } catch {
    // already gone, or not migrated
  }
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * Move an order along, and settle the commission with it.
 *
 * Completing is what pays the agent: the money is owed when the work is done,
 * not when it was paid for. Cancelling or refunding voids it, which is the
 * same rule a bundle follows for a delivery that never landed.
 */
export async function updateServiceOrder(fd: FormData): Promise<void> {
  await requireDataAdminAction();
  const id = str(fd, "id");
  const status = str(fd, "status");
  if (!id || !isServiceStatus(status)) return;

  try {
    const order = await dataDb.dataServiceOrder.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) return;

    await dataDb.dataServiceOrder.update({
      where: { id },
      data: {
        status,
        adminNote: str(fd, "adminNote").slice(0, 500),
        completedAt: status === "completed" ? new Date() : null,
      },
    });

    if (status === "completed") await creditServiceCommission(id);
    if (status === "cancelled" || status === "refunded") await voidServiceCommission(id);

    refresh();
  } catch {
    // not migrated — nothing to move
  }
}

/** Remove a document somebody attached. */
export async function deleteServiceDocument(fd: FormData): Promise<void> {
  await requireDataAdminAction();
  const id = str(fd, "id");
  if (!id) return;
  try {
    await dataDb.dataServiceDocument.delete({ where: { id } });
    revalidatePath("/admin/data/products/orders");
    revalidatePath("/admin/data/products/documents");
  } catch {
    // already gone
  }
}

// ---------------------------------------------------------------------------
// Settings and branding
// ---------------------------------------------------------------------------

/** Where the shelf is shown, and how heavy a document may be. */
export async function saveServiceSettings(
  _state: ServiceAdminState,
  fd: FormData,
): Promise<ServiceAdminState> {
  await requireDataAdminAction();
  try {
    await saveDataSettings({
      dataServicesEnabled: fd.get("enabled") !== null ? "1" : "0",
      dataServicesOnStore: fd.get("onStore") !== null ? "1" : "0",
      dataServicesOnHomepage: fd.get("onHomepage") !== null ? "1" : "0",
      dataServicesHeading: str(fd, "heading").slice(0, 80),
      dataServicesBlurb: str(fd, "blurb").slice(0, 240),
      dataServiceMaxUploadMb: String(Math.min(Math.max(num(fd, "maxUploadMb", 2), 0.5), 10)),
    });
    refresh();
    revalidatePath("/");
    return { ok: true, message: "Saved." };
  } catch {
    return { error: STORAGE_ERROR };
  }
}

/** The house flyer design every agent's service share starts from. */
export async function saveHouseServiceFlyerDesign(
  _state: ServiceAdminState,
  fd: FormData,
): Promise<ServiceAdminState> {
  await requireDataAdminAction();
  const design = str(fd, "design");
  try {
    await saveDataSettings({ dataServiceFlyerDesign: design });
    revalidatePath("/admin/data/products/flyer");
    revalidatePath("/agent/products");
    return { ok: true, message: "House design saved." };
  } catch {
    return { error: STORAGE_ERROR };
  }
}
