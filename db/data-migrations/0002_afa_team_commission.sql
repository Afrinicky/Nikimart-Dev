-- 0002 — AFA registrations can pay a team commission too.
--
-- 0001 gave bundle orders a team-commission snapshot and left AFA without one,
-- which made the "do AFA registrations count as a qualifying sale?" setting a
-- switch with nothing on the other end of it. These are the same four columns
-- the bundle order carries, for the same reason: what the recruiter earns is
-- fixed when the sale is made, so a later rate change never rewrites it.
--
-- Nothing starts paying because of this file. The setting is off by default,
-- and a registration sold before these columns existed has a zero commission
-- and a status of 'pending' that the first credit attempt closes as void.

ALTER TABLE "AfaRegistration" ADD COLUMN IF NOT EXISTS "teamAgentId"          TEXT;
ALTER TABLE "AfaRegistration" ADD COLUMN IF NOT EXISTS "teamCommission"       DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "AfaRegistration" ADD COLUMN IF NOT EXISTS "teamCommissionStatus" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "AfaRegistration" ADD COLUMN IF NOT EXISTS "teamCommissionPaidAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "AfaRegistration_teamAgentId_createdAt_idx"
  ON "AfaRegistration"("teamAgentId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AfaRegistration" ADD CONSTRAINT "AfaRegistration_teamAgentId_fkey"
    FOREIGN KEY ("teamAgentId") REFERENCES "DataAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
