"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

export type ShippingRatesState = { ok?: boolean; error?: string };

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

async function setSetting(key: string, value: string) {
  await prisma.siteSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

/**
 * Save the whole shipping-rate configuration in one submit: the global default
 * ₵/CBM, the international rates + arrival hub, and every origin→destination
 * route rate from the matrix. A blank route cell clears that route (so it falls
 * back to the default); an explicit 0 keeps it free.
 */
export async function saveShippingRates(_prev: ShippingRatesState, fd: FormData): Promise<ShippingRatesState> {
  await requireAdmin();

  const numeric: [string, string][] = [
    ["shippingDefaultRatePerCbm", "Default rate"],
    ["intlRatePerCbmCN", "China rate"],
    ["intlRatePerCbmAE", "UAE rate"],
    ["intlRatePerCbmUS", "USA rate"],
    ["intlRatePerCbmEU", "Europe rate"],
    ["intlDefaultRatePerCbm", "International default rate"],
  ];
  for (const [key, label] of numeric) {
    const v = str(fd, key);
    if (v && !(Number(v) >= 0)) return { error: `${label} must be a number ≥ 0.` };
  }

  for (const [key] of numeric) {
    if (fd.has(key)) await setSetting(key, str(fd, key));
  }
  if (fd.has("internationalArrivalHubId")) {
    await setSetting("internationalArrivalHubId", str(fd, "internationalArrivalHubId"));
  }

  // Route matrix: fields named `rate::<originHubId>::<destPickupId>`.
  for (const [key, raw] of fd.entries()) {
    if (!key.startsWith("rate::")) continue;
    const [, originHubId, destPickupId] = key.split("::");
    if (!originHubId || !destPickupId) continue;
    const value = String(raw ?? "").trim();

    if (value === "") {
      await prisma.shippingRate
        .deleteMany({ where: { originHubId, destPickupId } })
        .catch(() => {});
      continue;
    }
    const rate = Number(value);
    if (!(rate >= 0)) return { error: "Route rates must be numbers ≥ 0." };
    await prisma.shippingRate.upsert({
      where: { originHubId_destPickupId: { originHubId, destPickupId } },
      update: { ratePerCbm: rate },
      create: { originHubId, destPickupId, ratePerCbm: rate },
    });
  }

  revalidatePath("/admin/shipping");
  revalidatePath("/checkout");
  return { ok: true };
}
