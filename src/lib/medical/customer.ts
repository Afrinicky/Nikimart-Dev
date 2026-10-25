import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isMedicalConfigured, medicalDb } from "@/lib/medical/db";

/**
 * Who is shopping.
 *
 * The staff side of this is `session.ts`; this is the other one. Both hang off
 * the same retail `User` — one Nickimart account across the three businesses —
 * and neither implies the other: a procurement officer here is very often also
 * an ordinary customer in the mall, and somebody buying a box of gloves is not
 * staff.
 *
 * The `MedicalCustomer` row is made on demand rather than at registration.
 * Registration happens on the retail side and knows nothing about this
 * business, and a trigger across two databases is not a thing Postgres can do.
 * So the row appears the first time somebody does something here that needs
 * one — opening their account, saving a product, asking for a quotation — and
 * its denormalised name, email and phone are refreshed from the retail user
 * whenever they have drifted.
 */

export interface MedicalCustomerSession {
  customerId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  customerType: string;
  organisationId: string | null;
  jobTitle: string;
}

/** The signed-in retail user, or null. Cached per request. */
const currentUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  });
});

function toSession(row: {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  customerType: string;
  organisationId: string | null;
  jobTitle: string;
}): MedicalCustomerSession {
  return {
    customerId: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    customerType: row.customerType,
    organisationId: row.organisationId,
    jobTitle: row.jobTitle,
  };
}

const CUSTOMER_FIELDS = {
  id: true,
  userId: true,
  name: true,
  email: true,
  phone: true,
  customerType: true,
  organisationId: true,
  jobTitle: true,
} as const;

/**
 * The customer record for the signed-in account, without creating one.
 *
 * Returns null for a visitor who is not signed in, and for one who is but has
 * never done anything here. Read-only, so it is safe on a page that renders
 * for everybody — a GET request should not write a row.
 */
export const medicalCustomer = cache(async (): Promise<MedicalCustomerSession | null> => {
  if (!isMedicalConfigured()) return null;
  const user = await currentUser();
  if (!user) return null;

  try {
    const row = await medicalDb.medicalCustomer.findUnique({
      where: { userId: user.id },
      select: CUSTOMER_FIELDS,
    });
    // `isActive` is deliberately not consulted here. Nothing sets it false
    // yet, and when something does, a suspended account needs a page that
    // says so — treating it as "not signed in" would bounce them to a login
    // they are already through, which is a loop rather than an answer.
    return row ? toSession(row) : null;
  } catch {
    // The same rule the rest of this tree follows: a database that is briefly
    // unreachable costs the section, not the page.
    return null;
  }
});

/**
 * The customer record, created if this account has never had one.
 *
 * Call this from an action or from a page that is already behind a sign-in
 * check — never from one that renders for anonymous visitors.
 */
export async function ensureMedicalCustomer(): Promise<MedicalCustomerSession | null> {
  if (!isMedicalConfigured()) return null;
  const user = await currentUser();
  if (!user) return null;

  const name = user.name?.trim() ?? "";
  const email = user.email?.trim() ?? "";
  const phone = user.phone?.trim() ?? "";

  const row = await medicalDb.medicalCustomer.upsert({
    where: { userId: user.id },
    // Only the denormalised copies are refreshed. Anything they have told this
    // business about themselves — their institution, what kind of customer
    // they are, their job title — is theirs and is never overwritten from the
    // retail profile.
    update: { name, email, phone },
    create: { userId: user.id, name, email, phone },
    select: CUSTOMER_FIELDS,
  });

  return toSession(row);
}

/**
 * Guards a customer page: signs them in first, and comes back here afterwards.
 *
 * `callbackUrl` is the parameter `src/app/login/page.tsx` reads. Spelling it
 * anything else sends people to the retail home after signing in, which is the
 * kind of bug that reads as "the login is broken".
 */
export async function requireMedicalCustomer(pathname: string): Promise<MedicalCustomerSession> {
  const customer = await ensureMedicalCustomer();
  if (!customer) redirect(`/login?callbackUrl=${encodeURIComponent(pathname)}`);
  return customer;
}
