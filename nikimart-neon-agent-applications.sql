-- NikiMart — agent applications.
--
-- Signup is now an application an admin approves rather than an instant
-- account. Run after nikimart-neon-data-agents.sql.
--
-- Safe to run more than once.

BEGIN;

CREATE TABLE IF NOT EXISTS "DataAgentApplication" (
    "id"             TEXT NOT NULL,
    "fullName"       TEXT NOT NULL,
    "phone"          TEXT NOT NULL,
    "email"          TEXT NOT NULL,
    "desiredSlug"    TEXT NOT NULL,
    "note"           TEXT NOT NULL DEFAULT '',
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy"     TEXT,
    "reviewedAt"     TIMESTAMP(3),
    "adminNote"      TEXT NOT NULL DEFAULT '',
    -- SHA-256 of the one-time setup token, never the token itself.
    "setupTokenHash" TEXT,
    "setupExpiresAt" TIMESTAMP(3),
    "agentId"        TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataAgentApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DataAgentApplication_status_createdAt_idx"
    ON "DataAgentApplication" ("status", "createdAt");
CREATE INDEX IF NOT EXISTS "DataAgentApplication_email_idx"
    ON "DataAgentApplication" ("email");
CREATE INDEX IF NOT EXISTS "DataAgentApplication_desiredSlug_idx"
    ON "DataAgentApplication" ("desiredSlug");

COMMIT;
