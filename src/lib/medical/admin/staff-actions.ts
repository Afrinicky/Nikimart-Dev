"use server";

import { revalidatePath } from "next/cache";
import { medicalDb } from "@/lib/medical/db";
import { prisma } from "@/lib/prisma";
import { requireMedicalRole } from "@/lib/medical/session";
import { recordAudit } from "@/lib/medical/audit";
import { isMedicalRole, MEDICAL_ROLE_LABELS } from "@/lib/medical/roles";
import { validateSetting } from "@/lib/medical/settings";

/**
 * Staff accounts and the settings behind them. ADMIN only, both of them.
 *
 * A staff record is a *role granted to an existing Nickimart account*, not a
 * new login. Identity is one account across the three businesses, so there is
 * no password to set here and no invitation email to send: the person registers
 * on Nickimart like anybody else, and this is where somebody who is already
 * trusted says what they may do in the medical console.
 *
 * That is also why granting access is a lookup by email rather than a form with
 * a name on it — typing a name creates a record that may belong to nobody, and
 * the console would then show a colleague who cannot sign in.
 */

export type ActionResult = { ok: true; id?: string; message?: string } | { ok: false; error: string };

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function failed(error: unknown, fallback: string): ActionResult {
  if (error instanceof Error) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/**
 * Grant console access to an existing Nickimart account.
 *
 * The retail `User` row is the one cross-database read the medical side is
 * allowed, and this is one of the two places it happens: looking the person up
 * by the email they already sign in with. Name and email are then denormalised
 * onto the staff row so every list and every document can be rendered without
 * crossing databases per row.
 */
export async function grantStaffAccess(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("staff", ["ADMIN"]);
    const email = text(form, "email").toLowerCase();
    const role = text(form, "role");

    if (!email) return { ok: false, error: "Enter the email they sign in with." };
    if (!isMedicalRole(role)) return { ok: false, error: "Choose a role." };

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, name: true, email: true, phone: true },
    });
    if (!user) {
      return {
        ok: false,
        error:
          "No Nickimart account uses that address. They register at nickimart.com first — this grants a role, it does not create a login.",
      };
    }

    const existing = await medicalDb.medicalStaff.findUnique({ where: { userId: user.id } });
    if (existing) {
      return {
        ok: false,
        error: existing.isActive
          ? "That account already has console access. Change their role below instead."
          : "That account had access before. Reinstate it below rather than granting it twice.",
      };
    }

    const id = await medicalDb.$transaction(async (tx) => {
      const created = await tx.medicalStaff.create({
        data: {
          userId: user.id,
          name: user.name ?? "",
          email: user.email ?? email,
          phone: user.phone ?? "",
          role,
          isActive: true,
        },
      });
      await recordAudit(tx, staff, {
        action: "CREATE",
        entity: "MedicalStaff",
        entityId: created.id,
        summary: `Granted ${MEDICAL_ROLE_LABELS[role]} access to ${user.email ?? email}`,
      });
      return created.id;
    });

    revalidatePath("/medicals/admin/staff");
    return { ok: true, id, message: `${user.name || email} can now sign in to the console.` };
  } catch (error) {
    return failed(error, "Access could not be granted.");
  }
}

/**
 * Change somebody's role.
 *
 * Refuses to remove the last administrator, which is the one way a console can
 * be locked out of its own settings. Counted inside the transaction, so two
 * people demoting the two remaining administrators at once cannot both succeed.
 */
export async function changeStaffRole(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("staff", ["ADMIN"]);
    const id = text(form, "staffId");
    const role = text(form, "role");
    if (!isMedicalRole(role)) return { ok: false, error: "Choose a role." };

    await medicalDb.$transaction(async (tx) => {
      const target = await tx.medicalStaff.findUniqueOrThrow({ where: { id } });
      if (target.role === role) throw new Error(`They are already ${MEDICAL_ROLE_LABELS[role]}.`);

      if (target.role === "ADMIN" && role !== "ADMIN") {
        const admins = await tx.medicalStaff.count({ where: { role: "ADMIN", isActive: true } });
        if (admins <= 1) {
          throw new Error(
            "They are the only administrator. Give somebody else that role first — a console with none cannot reach its own settings.",
          );
        }
      }

      await tx.medicalStaff.update({ where: { id }, data: { role } });
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "MedicalStaff",
        entityId: id,
        summary: `Changed ${target.name || target.email} from ${MEDICAL_ROLE_LABELS[target.role as keyof typeof MEDICAL_ROLE_LABELS] ?? target.role} to ${MEDICAL_ROLE_LABELS[role]}`,
        changes: { before: target.role, after: role },
      });
    });

    revalidatePath("/medicals/admin/staff");
    return { ok: true };
  } catch (error) {
    return failed(error, "The role could not be changed.");
  }
}

/**
 * Suspend or reinstate access.
 *
 * Suspended rather than deleted: the staff row is what every audit entry,
 * stock movement and issued quotation points at, and removing it would leave
 * the record of their work unattributable. `medicalStaff()` reads `isActive` on
 * every request, so suspension takes effect on their next page load rather than
 * when their session token happens to expire.
 */
export async function setStaffActive(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("staff", ["ADMIN"]);
    const id = text(form, "staffId");
    const active = text(form, "active") === "1";
    const note = text(form, "note");

    if (!active && id === staff.staffId) {
      return { ok: false, error: "You cannot suspend your own access." };
    }
    if (!active && !note) {
      return { ok: false, error: "Give a reason. It stays on their record." };
    }

    await medicalDb.$transaction(async (tx) => {
      const target = await tx.medicalStaff.findUniqueOrThrow({ where: { id } });

      if (!active && target.role === "ADMIN") {
        const admins = await tx.medicalStaff.count({ where: { role: "ADMIN", isActive: true } });
        if (admins <= 1) {
          throw new Error("They are the only active administrator. Appoint another one first.");
        }
      }

      await tx.medicalStaff.update({
        where: { id },
        data: { isActive: active, statusNote: active ? "" : note },
      });
      await recordAudit(tx, staff, {
        action: active ? "APPROVE" : "CANCEL",
        entity: "MedicalStaff",
        entityId: id,
        summary: active
          ? `Reinstated ${target.name || target.email}`
          : `Suspended ${target.name || target.email}: ${note}`,
      });
    });

    revalidatePath("/medicals/admin/staff");
    return { ok: true };
  } catch (error) {
    return failed(error, "Access could not be changed.");
  }
}

/**
 * Save the settings on one group.
 *
 * Validated against each row's declared type on the way in, so a number field
 * cannot be stored as "soon" and then read back as the fallback — which is how
 * somebody discovers months later that the value they set never applied.
 */
export async function saveSettings(form: FormData): Promise<ActionResult> {
  try {
    const staff = await requireMedicalRole("settings", ["ADMIN"]);
    const group = text(form, "group");
    if (!group) return { ok: false, error: "Missing group." };

    const rows = await medicalDb.medicalSetting.findMany({ where: { group } });
    const changes: { key: string; before: string; after: string }[] = [];

    for (const row of rows) {
      const raw = form.get(`set:${row.key}`);
      if (raw === null) continue;
      const next = String(raw).trim();
      if (next === row.value) continue;

      const problem = validateSetting(next, row.valueType);
      if (problem) return { ok: false, error: `${row.label || row.key}: ${problem}` };

      changes.push({ key: row.key, before: row.value, after: next });
    }

    if (changes.length === 0) return { ok: true, message: "Nothing changed." };

    await medicalDb.$transaction(async (tx) => {
      for (const change of changes) {
        await tx.medicalSetting.update({
          where: { key: change.key },
          data: { value: change.after, updatedById: staff.staffId },
        });
      }
      await recordAudit(tx, staff, {
        action: "UPDATE",
        entity: "MedicalSetting",
        entityId: group,
        summary: `Changed ${changes.length} setting${changes.length === 1 ? "" : "s"} under ${group}`,
        changes: { settings: changes },
      });
    });

    revalidatePath("/medicals/admin/settings");
    return {
      ok: true,
      message: `${changes.length} setting${changes.length === 1 ? "" : "s"} saved.`,
    };
  } catch (error) {
    return failed(error, "The settings could not be saved.");
  }
}
