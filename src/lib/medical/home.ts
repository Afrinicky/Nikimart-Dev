import "server-only";
import { isMedicalConfigured, medicalDb } from "@/lib/medical/db";
import { isMedicalRole } from "@/lib/medical/roles";

/**
 * Where somebody who works here lands when they sign in.
 *
 * Signing in should put a person where they do their work. An administrator,
 * a storekeeper or a salesperson signing in and landing on the shop's account
 * page has to know that the console exists and where it lives — which is a
 * thing a system should tell them, not a thing they should have to be told.
 *
 * Returns null for everybody else, so the caller keeps its own answer. It
 * never throws: the medical database being unreachable must not stop somebody
 * signing in to the mall, so a failure here reads as "not medical staff" and
 * they land where they would have anyway.
 */
export async function medicalHomeForUser(userId: string): Promise<string | null> {
  if (!isMedicalConfigured() || !userId) return null;

  try {
    const staff = await medicalDb.medicalStaff.findUnique({
      where: { userId },
      select: { role: true, isActive: true },
    });
    if (!staff || !staff.isActive || !isMedicalRole(staff.role)) return null;
    // Every role lands on the overview. The console's own navigation then
    // shows each role only the sections it may reach, so there is no need for
    // a per-role landing page — and a storekeeper sent straight to Inventory
    // would never discover the two other screens they are allowed.
    return "/medicals/admin";
  } catch {
    return null;
  }
}
