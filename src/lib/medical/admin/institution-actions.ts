"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from ".prisma/medical-client";
import { medicalDb } from "@/lib/medical/db";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { toDecimalString, toPesewas } from "@/lib/medical/money";

/** Registering the hospitals, laboratories and clinics that buy from us. */

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveInstitution(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("institutions");
    const id = text(form, "id");
    const name = text(form, "name");
    if (!name) return { ok: false, error: "An institution needs a name." };

    const data = {
      name,
      kind: text(form, "kind") || "HOSPITAL",
      about: text(form, "about"),
      registrationNo: text(form, "registrationNo"),
      taxId: text(form, "taxId"),
      email: text(form, "email"),
      phone: text(form, "phone"),
      website: text(form, "website"),
      addressLine1: text(form, "addressLine1"),
      addressLine2: text(form, "addressLine2"),
      city: text(form, "city"),
      region: text(form, "region"),
      country: text(form, "country") || "Ghana",
      digitalAddress: text(form, "digitalAddress"),
      defaultPaymentTerms: text(form, "defaultPaymentTerms"),
      // Credit is a finance decision, so it is set here but gated by role on
      // the way in — sales can add an institution and cannot approve its credit.
      creditApproved: text(form, "creditApproved") === "1",
      creditLimit: toDecimalString(toPesewas(text(form, "creditLimit"))),
      isActive: text(form, "isActive") !== "0",
    };

    const result = await medicalDb.$transaction(async (tx) => {
      if (id) {
        const before = await tx.organisation.findUniqueOrThrow({ where: { id } });
        // Only finance and above may move a credit decision. Checked here
        // rather than by hiding the field, because a hidden field is still a
        // field somebody can post.
        if (
          (before.creditApproved !== data.creditApproved ||
            String(before.creditLimit) !== data.creditLimit) &&
          !["ADMIN", "MANAGER", "FINANCE"].includes(staff.role)
        ) {
          throw new Error("Only finance can change a credit arrangement.");
        }
        const row = await tx.organisation.update({ where: { id }, data });
        await recordAudit(tx, staff, {
          action: "UPDATE",
          entity: "Organisation",
          entityId: id,
          summary: `Updated ${before.name}`,
        });
        return row;
      }

      const slug = await uniqueSlug(tx, name);
      const row = await tx.organisation.create({ data: { ...data, slug } });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "Organisation",
        entityId: row.id,
        summary: `Added institution ${name}`,
      });
      return row;
    });

    revalidatePath("/medicals/admin/institutions");
    return { ok: true, id: result.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "An institution with that name already exists." };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The institution could not be saved.",
    };
  }
}

async function uniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "institution";
  for (let n = 0; n < 200; n += 1) {
    const slug = n === 0 ? base : `${base}-${n}`;
    const taken = await tx.organisation.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now()}`;
}
