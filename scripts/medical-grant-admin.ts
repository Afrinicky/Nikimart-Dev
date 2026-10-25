/**
 * Grant the first medical administrator.
 *
 * The console's own staff screen can only be opened by an administrator, so on
 * a fresh deployment there is no way in: somebody has to be made one from
 * outside. That is what this is for, and it is the only thing it does.
 *
 *   MEDICAL_DATABASE_URL=… DATABASE_URL=… \
 *     npx tsx scripts/medical-grant-admin.ts someone@example.com
 *
 * It grants a role to an account that already exists. Identity is one
 * Nickimart account across the three businesses, so the person registers at
 * the site like any other customer first — this does not create a login and
 * cannot set a password.
 *
 * Safe to re-run: an account that already has a staff row is promoted to
 * administrator and reactivated rather than duplicated.
 */
import { PrismaClient as MedicalClient } from ".prisma/medical-client";
import { PrismaClient as RetailClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();

const medical = new MedicalClient();
const retail = new RetailClient();

async function main(): Promise<void> {
  if (!email) {
    fail(
      "Give the email of the account to promote:\n" +
        "  npx tsx scripts/medical-grant-admin.ts someone@example.com",
    );
  }
  if (!process.env.MEDICAL_DATABASE_URL?.trim()) {
    fail("MEDICAL_DATABASE_URL is not set, so there is no medical database to write to.");
  }
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL is not set, and the account being promoted lives in the retail database.");
  }

  // The one cross-database read the medical side is allowed: the retail User
  // row behind a medical staff member.
  const user = await retail.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user) {
    fail(
      `No Nickimart account uses ${email}.\n\n` +
        "This grants a role to an account that already exists — it does not create\n" +
        "a login. Register at the site first, then run this again.",
    );
    return;
  }

  const existing = await medical.medicalStaff.findUnique({ where: { userId: user.id } });

  if (existing) {
    await medical.medicalStaff.update({
      where: { userId: user.id },
      data: {
        role: "ADMIN",
        isActive: true,
        statusNote: "",
        name: user.name ?? existing.name,
        email: user.email ?? existing.email,
      },
    });
    console.log(
      `${user.email} was already medical staff as ${existing.role}` +
        `${existing.isActive ? "" : " (suspended)"} — now an active administrator.`,
    );
  } else {
    await medical.medicalStaff.create({
      data: {
        userId: user.id,
        name: user.name ?? "",
        email: user.email ?? email,
        phone: user.phone ?? "",
        role: "ADMIN",
        isActive: true,
      },
    });
    console.log(`${user.email} is now a medical administrator.`);
  }

  // Said out loud because it is the next thing that goes wrong: an
  // administrator who cannot sign in has not been helped.
  const admins = await medical.medicalStaff.count({ where: { role: "ADMIN", isActive: true } });
  console.log(`\nActive administrators: ${admins}`);
  console.log("They sign in at /login with their ordinary Nickimart password,");
  console.log("then open /medicals/admin. Everybody else is granted access from");
  console.log("Staff inside the console, so this should only be needed once.");
}

function fail(message: string): never {
  console.error(`\n${message}\n`);
  process.exit(1);
}

main()
  .catch((error) => {
    console.error("\nFailed:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await medical.$disconnect();
    await retail.$disconnect();
  });
