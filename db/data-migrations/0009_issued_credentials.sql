-- Registrations where Nickimart issues the password rather than the applicant
-- choosing it.
--
-- Somebody who applied on the public form typed their own password and it
-- travels no further than the form. Somebody an agent registered gets one
-- generated and sent to them, which is a different thing in two ways worth
-- recording: it must be changed the moment they sign in, and it must be sent
-- exactly once — and, for a registration being paid for at a gateway, not
-- until the money is actually in.

-- The password on this application was issued by us, so the account it becomes
-- is made to change it at first sign-in.
ALTER TABLE "DataAgentApplication"
  ADD COLUMN IF NOT EXISTS "passwordIsTemporary" BOOLEAN NOT NULL DEFAULT false;

-- When the credentials went out. Null means they have not, which is what makes
-- issuing them idempotent: a webhook and a redirect settling the same payment
-- together still send one message, with one password.
ALTER TABLE "DataAgentApplication"
  ADD COLUMN IF NOT EXISTS "credentialsSentAt" TIMESTAMP(3);
