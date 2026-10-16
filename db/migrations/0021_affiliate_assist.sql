-- 0021 — the affiliate as the customer's helper.
--
-- An affiliate who referred a sale is the person that buyer trusts: they
-- answered the questions before the order and they are the one asked where it
-- is afterwards. Until now they could see that an order existed and nothing
-- else, so every follow-up left Nickimart entirely — a WhatsApp thread nobody
-- else could see, with no record of what was promised and no way for the
-- affiliate to find out anything true.
--
-- Three tables, and deliberately no fourth: a conversation, the messages in
-- it, and a record of which outstanding action has been dealt with. The
-- outstanding actions themselves are derived from the orders and the threads
-- on every read, because a task list that is written down drifts from the
-- state it describes and then has to be reconciled.
--
-- What is NOT here matters as much: nothing in these tables carries a payment
-- detail, a settlement figure or a contact number. An affiliate assists a
-- buyer through the console; they do not get a copy of the buyer's record.

-- One conversation. Either affiliate ↔ customer, or affiliate ↔ Nickimart
-- support, which is the same shape doing a different job: an enquiry an
-- affiliate cannot answer is escalated as a thread of its own, linked back to
-- the one it came from, so "what did we tell this buyer, and on whose word"
-- has an answer.
CREATE TABLE IF NOT EXISTS "AffiliateThread" (
  "id"              TEXT NOT NULL,
  "affiliateId"     TEXT NOT NULL,
  -- customer | support
  "kind"            TEXT NOT NULL DEFAULT 'customer',
  -- The buyer or link-clicker this is about. Null on a support thread raised
  -- about a product rather than a person.
  "customerId"      TEXT,
  -- The order it concerns, when it concerns one.
  "orderId"         TEXT,
  -- general | availability | delivery | complaint | return | repeat | comparison
  "topic"           TEXT NOT NULL DEFAULT 'general',
  "subject"         TEXT NOT NULL DEFAULT '',
  -- open | waiting_customer | waiting_affiliate | waiting_support | resolved
  "status"          TEXT NOT NULL DEFAULT 'open',
  -- normal | high | urgent. Only support threads are prioritised.
  "priority"        TEXT NOT NULL DEFAULT 'normal',
  -- affiliate | customer | support
  "openedBy"        TEXT NOT NULL DEFAULT 'affiliate',
  -- The customer thread an escalation was raised from.
  "escalatedFromId" TEXT,
  -- Who has read how far. Unread is derived from these against the last
  -- message rather than counted into a column, so nothing can drift.
  "affiliateReadAt" TIMESTAMP(3),
  "customerReadAt"  TIMESTAMP(3),
  "supportReadAt"   TIMESTAMP(3),
  "lastMessageAt"   TIMESTAMP(3),
  -- The role that sent it, so "is there something here for me" is one read.
  "lastMessageRole" TEXT NOT NULL DEFAULT '',
  "lastMessageText" TEXT NOT NULL DEFAULT '',
  "resolvedAt"      TIMESTAMP(3),
  "resolution"      TEXT NOT NULL DEFAULT '',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateThread_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateThread_affiliateId_lastMessageAt_idx"
  ON "AffiliateThread"("affiliateId", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "AffiliateThread_customerId_idx" ON "AffiliateThread"("customerId");
CREATE INDEX IF NOT EXISTS "AffiliateThread_orderId_idx" ON "AffiliateThread"("orderId");
CREATE INDEX IF NOT EXISTS "AffiliateThread_kind_status_idx" ON "AffiliateThread"("kind", "status");

-- One message. `internal` is the affiliate's own note or support's working
-- note: kept with the conversation because that is where it is useful, hidden
-- from the customer because it was never addressed to them.
CREATE TABLE IF NOT EXISTS "AffiliateMessage" (
  "id"            TEXT NOT NULL,
  "threadId"      TEXT NOT NULL,
  "authorId"      TEXT,
  -- affiliate | customer | support
  "authorRole"    TEXT NOT NULL DEFAULT 'affiliate',
  -- Snapshotted, so a closed account still leaves a readable record.
  "authorName"    TEXT NOT NULL DEFAULT '',
  "body"          TEXT NOT NULL,
  "internal"      BOOLEAN NOT NULL DEFAULT false,
  -- Set when this repeats something support confirmed, so the customer can see
  -- that the answer came from Nickimart rather than from a guess.
  "relayedFromId" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AffiliateMessage_threadId_createdAt_idx"
  ON "AffiliateMessage"("threadId", "createdAt");

-- An outstanding action the affiliate has dealt with.
--
-- The list of outstanding actions is computed from the orders and threads, so
-- this table holds only the acknowledgement: one row per item handled, keyed
-- on a string that encodes the state it was handled in. When that state moves
-- on — a delayed order slips another week, a buyer writes again — the key
-- changes and the item comes back, which is the behaviour a follow-up list has
-- to have to be worth looking at.
CREATE TABLE IF NOT EXISTS "AffiliateFollowUp" (
  "id"          TEXT NOT NULL,
  "affiliateId" TEXT NOT NULL,
  "key"         TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT '',
  "orderId"     TEXT,
  "threadId"    TEXT,
  "note"        TEXT NOT NULL DEFAULT '',
  "handledAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AffiliateFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AffiliateFollowUp_affiliateId_key_key"
  ON "AffiliateFollowUp"("affiliateId", "key");
CREATE INDEX IF NOT EXISTS "AffiliateFollowUp_affiliateId_handledAt_idx"
  ON "AffiliateFollowUp"("affiliateId", "handledAt");

-- Foreign keys, each guarded so a rerun is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateThread_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateThread"
      ADD CONSTRAINT "AffiliateThread_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateThread_customerId_fkey') THEN
    ALTER TABLE "AffiliateThread"
      ADD CONSTRAINT "AffiliateThread_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateThread_orderId_fkey') THEN
    ALTER TABLE "AffiliateThread"
      ADD CONSTRAINT "AffiliateThread_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateThread_escalatedFromId_fkey') THEN
    ALTER TABLE "AffiliateThread"
      ADD CONSTRAINT "AffiliateThread_escalatedFromId_fkey"
      FOREIGN KEY ("escalatedFromId") REFERENCES "AffiliateThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateMessage_threadId_fkey') THEN
    ALTER TABLE "AffiliateMessage"
      ADD CONSTRAINT "AffiliateMessage_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "AffiliateThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateMessage_authorId_fkey') THEN
    ALTER TABLE "AffiliateMessage"
      ADD CONSTRAINT "AffiliateMessage_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateMessage_relayedFromId_fkey') THEN
    ALTER TABLE "AffiliateMessage"
      ADD CONSTRAINT "AffiliateMessage_relayedFromId_fkey"
      FOREIGN KEY ("relayedFromId") REFERENCES "AffiliateMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateFollowUp_affiliateId_fkey') THEN
    ALTER TABLE "AffiliateFollowUp"
      ADD CONSTRAINT "AffiliateFollowUp_affiliateId_fkey"
      FOREIGN KEY ("affiliateId") REFERENCES "Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateFollowUp_orderId_fkey') THEN
    ALTER TABLE "AffiliateFollowUp"
      ADD CONSTRAINT "AffiliateFollowUp_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AffiliateFollowUp_threadId_fkey') THEN
    ALTER TABLE "AffiliateFollowUp"
      ADD CONSTRAINT "AffiliateFollowUp_threadId_fkey"
      FOREIGN KEY ("threadId") REFERENCES "AffiliateThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
