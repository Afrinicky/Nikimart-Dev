import "server-only";
import { dataDb } from "@/lib/data-db";
import { looksLikeEmail, phoneLast9 } from "@/lib/phone";

/**
 * Finding a bundle login by what somebody typed.
 *
 * The twin of src/lib/user-lookup.ts, against this database instead of the
 * mall's. Agents sign in with an email address or a phone number — often the
 * phone, because that is the thing they know — and phone matching has to be
 * format-agnostic for the same reason it is there: "024 000 0002",
 * "0240000002" and "+233240000002" are one person.
 */

export interface LookedUpDataUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  role: string;
  passwordHash: string | null;
  twoFactorEnabled: boolean;
  twoFactorChannel: string;
  mustChangePassword: boolean;
}

const SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  role: true,
  passwordHash: true,
  twoFactorEnabled: true,
  twoFactorChannel: true,
  mustChangePassword: true,
} as const;

export async function findDataUserByIdentifier(
  identifier: string,
): Promise<LookedUpDataUser | null> {
  const id = identifier.trim();
  if (!id) return null;

  if (looksLikeEmail(id)) {
    return dataDb.dataUser.findUnique({ where: { email: id.toLowerCase() }, select: SELECT });
  }

  const last9 = phoneLast9(id);
  if (!last9) return null;

  // Phone is not stored normalised, so match on trailing digits — the same
  // query the mall runs, against the same column shape.
  const rows = await dataDb.$queryRaw<LookedUpDataUser[]>`
    SELECT "id", "name", "email", "phone", "image", "role", "passwordHash",
           "twoFactorEnabled", "twoFactorChannel", "mustChangePassword"
    FROM "DataUser"
    WHERE "phone" IS NOT NULL
      AND right(regexp_replace("phone", '[^0-9]', '', 'g'), 9) = ${last9}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
