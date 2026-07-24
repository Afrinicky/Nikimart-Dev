import { prisma } from "@/lib/prisma";
import { looksLikeEmail, phoneLast9 } from "@/lib/phone";

export interface LookedUpUser {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  image: string | null;
  role: string;
  passwordHash: string | null;
}

/**
 * Find a user by email OR phone. Phone matching is format-agnostic: it compares
 * the last 9 significant digits, so "024 000 0002", "0240000002", and
 * "+233240000002" all resolve to the same account.
 */
export async function findUserByIdentifier(identifier: string): Promise<LookedUpUser | null> {
  const id = identifier.trim();
  if (!id) return null;

  if (looksLikeEmail(id)) {
    return prisma.user.findUnique({
      where: { email: id.toLowerCase() },
      select: { id: true, name: true, email: true, phone: true, image: true, role: true, passwordHash: true },
    });
  }

  const last9 = phoneLast9(id);
  if (!last9) return null;

  // Phone isn't stored in a normalised form, so match on trailing digits.
  const rows = await prisma.$queryRaw<LookedUpUser[]>`
    SELECT "id", "name", "email", "phone", "image", "role", "passwordHash"
    FROM "User"
    WHERE "phone" IS NOT NULL
      AND right(regexp_replace("phone", '[^0-9]', '', 'g'), 9) = ${last9}
    LIMIT 1
  `;
  return rows[0] ?? null;
}
