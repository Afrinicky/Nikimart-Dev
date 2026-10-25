import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { medicalDb, isMedicalConfigured } from "@/lib/medical/db";
import { canReach, isMedicalRole, type MedicalRole } from "@/lib/medical/roles";

/**
 * Who is using the medical console.
 *
 * Identity is the retail `User` — one Nickimart account across all three
 * businesses — and the *role* is the `MedicalStaff` row that account has here.
 * Somebody can be an ordinary customer in the mall, an agent on the bundle
 * platform and a procurement officer here, and none of those should imply the
 * others.
 *
 * The role is read from the database on every request rather than taken from
 * the session token, for the same reason `src/lib/session.ts` does it on the
 * retail side: the token is a JWT, so a role baked into it is only as fresh as
 * the last sign-in, and deactivating somebody would leave their existing token
 * working until it expired. Cached per request, so several guards on one page
 * cost one query.
 */

export interface MedicalStaffSession {
  staffId: string;
  userId: string;
  name: string;
  email: string;
  role: MedicalRole;
}

const lookupStaff = cache(async (userId: string) => {
  if (!isMedicalConfigured()) return null;
  try {
    return await medicalDb.medicalStaff.findUnique({
      where: { userId },
      select: { id: true, userId: true, name: true, email: true, role: true, isActive: true },
    });
  } catch {
    // The database being briefly unreachable must not hand somebody a console
    // they are not entitled to. Treated as "no staff record", which denies.
    return null;
  }
});

/** The signed-in staff member, or null when this account has no console access. */
export async function medicalStaff(): Promise<MedicalStaffSession | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const staff = await lookupStaff(session.user.id);
  if (!staff || !staff.isActive) return null;
  if (!isMedicalRole(staff.role)) return null;

  return {
    staffId: staff.id,
    userId: staff.userId,
    name: staff.name || session.user.name || staff.email,
    email: staff.email || session.user.email || "",
    role: staff.role,
  };
}

/**
 * Guards a console page. Redirects somebody who is not signed in to sign in,
 * and somebody without the role for this section to the overview — not to a
 * 403, because the overview is a page they can actually use and a dead end is
 * not an answer.
 */
export async function requireMedicalStaff(pathname: string): Promise<MedicalStaffSession> {
  const staff = await medicalStaff();
  // `callbackUrl`, which is what src/app/login/page.tsx reads. It was `next`,
  // and nothing read that: signing in from the console landed the person on
  // the retail home instead of the page they were sent away from.
  if (!staff) redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  if (!canReach(staff.role, pathname)) redirect("/medicals/admin");
  return staff;
}

/**
 * Guards a server action.
 *
 * Throws rather than redirects: an action is not a page, and a redirect out of
 * one is a silent no-op that looks like success. Every mutating action in the
 * console calls this with the section it belongs to, so authorisation is
 * checked where the write happens and not only where the button was drawn.
 */
export async function requireMedicalRole(
  section: string,
  allow?: readonly MedicalRole[],
): Promise<MedicalStaffSession> {
  const staff = await medicalStaff();
  if (!staff) throw new Error("You are not signed in.");
  if (!canReach(staff.role, `/medicals/admin/${section}`)) {
    throw new Error("You do not have access to this part of the console.");
  }
  if (allow && staff.role !== "ADMIN" && !allow.includes(staff.role)) {
    throw new Error("Your role cannot perform this action.");
  }
  return staff;
}
