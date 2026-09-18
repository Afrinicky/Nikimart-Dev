-- 0014 — a password somebody else chose has to be changed.
--
-- An agent registered by another agent never fills in a form, so they cannot
-- pick a password: one is generated for them and sent with their username.
-- That password has travelled through an SMS gateway and an inbox, and two
-- people know it, so it is a way in exactly once. This flag is what makes the
-- console insist on a new one before it will show them anything.
--
-- False for everybody who exists today: they chose their own.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
