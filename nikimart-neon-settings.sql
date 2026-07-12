-- NikiMart — Phase 9: FAQs + Locations (incremental, additive, safe to re-run).
-- Run ONCE in your Neon SQL Editor. Adds two tables and seeds default
-- locations + FAQs so you can edit them in the admin. Non-destructive.
BEGIN;
CREATE TABLE IF NOT EXISTS "Faq" ("id" TEXT PRIMARY KEY, "question" TEXT NOT NULL, "answer" TEXT NOT NULL, "order" INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS "Location" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'city', "region" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "order" INTEGER NOT NULL DEFAULT 0);

INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('any', 'Any Location', 'city', 'Nationwide', TRUE, 0) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ug', 'University of Ghana', 'campus', 'Greater Accra', TRUE, 1) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('knust', 'KNUST', 'campus', 'Ashanti', TRUE, 2) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ucc', 'UCC', 'campus', 'Central', TRUE, 3) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('upsa', 'UPSA', 'campus', 'Greater Accra', TRUE, 4) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('stu', 'Sunyani Technical University', 'campus', 'Bono', TRUE, 5) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ntc', 'Nursing Training College', 'institution', 'Bono', TRUE, 6) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('ttc', 'Teacher Training College', 'institution', 'Bono', TRUE, 7) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('st-elizabeth', 'St. Elizabeth Hospital Community', 'community', 'Ahafo', TRUE, 8) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('hwidiem', 'Hwidiem', 'town', 'Ahafo', TRUE, 9) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('goaso', 'Goaso', 'town', 'Ahafo', TRUE, 10) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('sunyani', 'Sunyani', 'city', 'Bono', TRUE, 11) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('kumasi', 'Kumasi', 'city', 'Ashanti', TRUE, 12) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Location" ("id","name","type","region","isActive","order") VALUES ('accra', 'Accra', 'city', 'Greater Accra', TRUE, 13) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-delivery', 'How does delivery and pickup work?', 'Many sellers offer same-day delivery, campus drop-off, or in-person pickup. The available options are shown on each product page and at checkout.', 0) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-preorder', 'How do preorders work?', 'Preorder items are imported on order. You pay a deposit to reserve your item, then settle the balance on arrival before delivery or pickup.', 1) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-pay', 'How do I pay?', 'NikiMart supports local payments including Mobile Money and card. You choose your payment method at checkout.', 2) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-sell', 'How do I become a seller?', 'Register your shop from “Sell on NikiMart”, complete quick verification, and start listing products.', 3) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "Faq" ("id","question","answer","order") VALUES ('faq-protection', 'Is my purchase protected?', 'Yes. Orders are covered by NikiMart Buyer Protection.', 4) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
SELECT gen_random_uuid()::text, 'c8a149d9bc9fd8ed6b429262beff6739d41243e17379b3c38a48dbaa4f7d1e2b', now(), '20260712144801_faqs_locations', now(), 1
WHERE NOT EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = '20260712144801_faqs_locations');
COMMIT;
