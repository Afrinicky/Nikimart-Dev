/**
 * Can the bundle business sign its own people in?
 *
 * The question before and after the cutover: are the logins here, can the
 * agents among them actually sign in, and — if you name somebody — what would
 * happen when they try. Read-only against the account table; it writes nothing
 * but a scratch key in the rate-limit table, which it removes again.
 *
 *   DATA_DATABASE_URL=… npx tsx scripts/data-login-status.ts
 *   DATA_DATABASE_URL=… npx tsx scripts/data-login-status.ts 0550000007
 *
 * It never touches the retail database. That is the thing being checked: if
 * this answers while the mall is down, the agents are no longer hostage to it.
 *
 * Exits non-zero when the database cannot be reached or the table is missing,
 * so it can gate the cutover. "No logins copied yet" is a normal state on the
 * way there, not a failure.
 */
import { PrismaClient } from ".prisma/data-client";
import { findDataUserByIdentifier } from "../src/lib/data-bundles/user-lookup.ts";

const db = new PrismaClient();
const identifier = process.argv[2]?.trim();

function say(label: string, value: string) {
  console.log(`  ${label.padEnd(32)} ${value}`);
}

async function main(): Promise<void> {
  if (!process.env.DATA_DATABASE_URL?.trim()) {
    console.error("DATA_DATABASE_URL is not set.");
    console.error("Without it the bundle client falls back to the mall's database, which is");
    console.error("the arrangement this whole change exists to get out of.");
    process.exit(1);
  }

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("The bundle database could not be reached.");
    console.error(error instanceof Error ? error.message.split("\n")[0] : String(error));
    process.exit(1);
  }

  let total: number;
  try {
    total = await db.dataUser.count();
  } catch {
    console.error('No "DataUser" table here yet — migration 0023 has not been applied.');
    console.error("It is applied by the build: deploy, then look for [migrate] data-bundles.");
    process.exit(1);
  }

  const [admins, agents, noPassword, mustChange, diverged] = await Promise.all([
    db.dataUser.count({ where: { role: "ADMIN" } }),
    db.dataUser.count({ where: { role: "AGENT" } }),
    db.dataUser.count({ where: { passwordHash: null } }),
    db.dataUser.count({ where: { mustChangePassword: true } }),
    db.dataUser.count({ where: { passwordChangedAt: { not: null } } }),
  ]);

  console.log("\nLogins in the bundle database\n");
  say("total", String(total));
  say("administrators", String(admins));
  say("agents", String(agents));
  say("cannot sign in (no password)", String(noPassword));
  say("must replace an issued password", String(mustChange));
  say("have changed it on this side", String(diverged));

  // An agent account with no login copied against it is the one that strands
  // somebody, so it is counted rather than left to be discovered.
  const agentRows = await db.dataAgent.findMany({ select: { userId: true } });
  const agentIds = [...new Set(agentRows.map((a: { userId: string }) => a.userId).filter(Boolean))];
  const present = await db.dataUser.findMany({
    where: { id: { in: agentIds } },
    select: { id: true },
  });
  const presentIds = new Set(present.map((r: { id: string }) => r.id));
  const stranded = agentIds.filter((id: string) => !presentIds.has(id));

  console.log();
  say("agent records", String(agentIds.length));
  say("of those, with a login here", String(presentIds.size));
  say("stranded (no login yet)", String(stranded.length));
  if (stranded.length) {
    console.log(`\n  Stranded agent user ids: ${stranded.slice(0, 10).join(", ")}${stranded.length > 10 ? " …" : ""}`);
    console.log("  Run scripts/copy-logins.mjs with the retail database reachable.");
  }

  if (identifier) {
    const found = await findDataUserByIdentifier(identifier);
    console.log(`\nWhat happens when "${identifier}" signs in\n`);
    if (!found) {
      say("result", "no account found — sign-in refused");
    } else {
      say("account", found.id);
      say("name", found.name ?? "(none)");
      say("email", found.email);
      say("phone", found.phone ?? "(none)");
      say("role", found.role);
      say("can sign in", found.passwordHash ? "yes" : "no — never had a password");
      if (found.mustChangePassword) {
        say("note", "must replace the issued password before the console opens");
      }
    }
  }

  console.log();
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
