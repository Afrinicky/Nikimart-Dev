-- 0023 — the bundle business keeps its own logins.
--
-- Identity was the last thing still crossing the line between the two
-- databases. An agent signed in with a mall account, so `requireUser()` read
-- the retail `User` table, so every agent console page needed the retail
-- database to be up. In October the retail Neon project used up its monthly
-- compute allowance and was suspended, and no agent could sign in — while
-- every bundle, order, ledger row and storefront in this database stayed
-- healthy and serving. A business that cannot be worked because a different
-- business is down is not a separate business.
--
-- So the logins come here as well. scripts/copy-logins.mjs fills this table
-- from the retail `User` rows of the people who work in this business: anybody
-- with a DataAgent row, and the admins who run the console.
--
-- "id" is the retail User.id, unchanged. DataAgent.userId, DataOrder.userId
-- and the ledger all hold those values as plain columns, so keeping the ids is
-- what makes this a copy rather than a rebuild: every existing reference goes
-- on resolving and nothing has to be re-keyed.
--
-- "passwordHash" is the bcrypt string, copied verbatim. Cost and salt live
-- inside it, so the password somebody already knows keeps working. Nobody is
-- reset.
--
-- "passwordChangedAt" is how the two sides are allowed to drift. Null means
-- the password is still the copied one and a re-run of the copy may refresh
-- it; set means this account has its own password now and the copy must leave
-- it alone.

CREATE TABLE IF NOT EXISTS "DataUser" (
  "id"                 TEXT NOT NULL,
  "name"               TEXT,
  "email"              TEXT NOT NULL,
  "phone"              TEXT,
  "image"              TEXT,
  "passwordHash"       TEXT,
  "role"               TEXT NOT NULL DEFAULT 'AGENT',
  "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  "twoFactorEnabled"   BOOLEAN NOT NULL DEFAULT false,
  "twoFactorChannel"   TEXT NOT NULL DEFAULT 'email',
  "activeSessionId"    TEXT,
  "activeSessionAt"    TIMESTAMP(3),
  "copiedAt"           TIMESTAMP(3),
  "passwordChangedAt"  TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DataUser_pkey" PRIMARY KEY ("id")
);

-- Unique here as it is in the mall, so one person cannot be copied in twice
-- and a second copy cannot quietly create a second way into the same store.
CREATE UNIQUE INDEX IF NOT EXISTS "DataUser_email_key" ON "DataUser"("email");

-- Signing in by phone matches on trailing digits, the same as the mall does,
-- so this index is for the lookups that go the other way: finding the login
-- behind an agent record, and the console's own search.
CREATE INDEX IF NOT EXISTS "DataUser_phone_idx" ON "DataUser"("phone");
CREATE INDEX IF NOT EXISTS "DataUser_role_idx" ON "DataUser"("role");
