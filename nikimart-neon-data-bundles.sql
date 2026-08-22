-- NikiMart — Neon catch-up SQL for the data bundle storefront.
-- Run this on the production (Neon) database before/at deploy.
-- Safe to run more than once (idempotent).
--
-- Without it the storefront still renders (it falls back to the starter price
-- ladder built into the code), but nothing can be ordered and the admin
-- console's price editor has nothing to write to.

-- 1) Sellable bundles: a size on a network at the price NikiMart charges.
CREATE TABLE IF NOT EXISTS "DataBundle" (
    "id"        TEXT NOT NULL,
    "network"   TEXT NOT NULL,
    "sizeGb"    DOUBLE PRECISION NOT NULL,
    "price"     DOUBLE PRECISION NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "validity"  TEXT NOT NULL DEFAULT 'No expiry',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataBundle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataBundle_network_sizeGb_key"
    ON "DataBundle" ("network", "sizeGb");
CREATE INDEX IF NOT EXISTS "DataBundle_network_isActive_idx"
    ON "DataBundle" ("network", "isActive");

-- 2) Bundle purchases. Guests can buy, so "userId" is nullable and the buyer is
--    identified by phone. "reference" doubles as the Paystack reference.
CREATE TABLE IF NOT EXISTS "DataOrder" (
    "id"              TEXT NOT NULL,
    "reference"       TEXT NOT NULL,
    "network"         TEXT NOT NULL,
    "sizeGb"          DOUBLE PRECISION NOT NULL,
    "price"           DOUBLE PRECISION NOT NULL,
    "costPrice"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recipientPhone"  TEXT NOT NULL,
    "buyerPhone"      TEXT NOT NULL,
    "buyerEmail"      TEXT,
    "buyerName"       TEXT,
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus"   TEXT NOT NULL DEFAULT 'unpaid',
    "paidAt"          TIMESTAMP(3),
    "providerOrderId" TEXT,
    "providerCode"    TEXT,
    "providerStatus"  TEXT,
    "providerMessage" TEXT,
    "dispatchedAt"    TIMESTAMP(3),
    "completedAt"     TIMESTAMP(3),
    "userId"          TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DataOrder_reference_key" ON "DataOrder" ("reference");
CREATE INDEX IF NOT EXISTS "DataOrder_buyerPhone_idx"      ON "DataOrder" ("buyerPhone");
CREATE INDEX IF NOT EXISTS "DataOrder_recipientPhone_idx"  ON "DataOrder" ("recipientPhone");
CREATE INDEX IF NOT EXISTS "DataOrder_status_idx"          ON "DataOrder" ("status");
CREATE INDEX IF NOT EXISTS "DataOrder_userId_idx"          ON "DataOrder" ("userId");
CREATE INDEX IF NOT EXISTS "DataOrder_createdAt_idx"       ON "DataOrder" ("createdAt");

-- 3) AFA (agent SIM) registrations sold through the storefront.
CREATE TABLE IF NOT EXISTS "AfaRegistration" (
    "id"              TEXT NOT NULL,
    "reference"       TEXT NOT NULL,
    "fullName"        TEXT NOT NULL,
    "phoneNumber"     TEXT NOT NULL,
    "idNumber"        TEXT NOT NULL,
    "dateOfBirth"     TEXT NOT NULL,
    "town"            TEXT NOT NULL,
    "occupation"      TEXT NOT NULL,
    "price"           DOUBLE PRECISION NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus"   TEXT NOT NULL DEFAULT 'unpaid',
    "paidAt"          TIMESTAMP(3),
    "providerId"      TEXT,
    "providerStatus"  TEXT,
    "providerMessage" TEXT,
    "dispatchedAt"    TIMESTAMP(3),
    "completedAt"     TIMESTAMP(3),
    "userId"          TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfaRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AfaRegistration_reference_key" ON "AfaRegistration" ("reference");
CREATE INDEX IF NOT EXISTS "AfaRegistration_phoneNumber_idx"      ON "AfaRegistration" ("phoneNumber");
CREATE INDEX IF NOT EXISTS "AfaRegistration_status_idx"           ON "AfaRegistration" ("status");
CREATE INDEX IF NOT EXISTS "AfaRegistration_createdAt_idx"        ON "AfaRegistration" ("createdAt");

-- 4) Seed the starter price ladder — ONLY while the table is still empty, so
--    re-running this never overwrites prices you've set in the admin.
--
--    !! These prices are PLACEHOLDERS. Open Admin -> Data -> Bundle prices and
--    !! set each row against your Justice Datashop agent cost before you
--    !! advertise the store.
INSERT INTO "DataBundle" ("id","network","sizeGb","price","costPrice","validity","isActive","order")
SELECT * FROM (VALUES
  ('seed_bundle_mtn_1','MTN',1,6,0,'No expiry',true,0),
  ('seed_bundle_mtn_2','MTN',2,11,0,'No expiry',true,1),
  ('seed_bundle_mtn_3','MTN',3,16,0,'No expiry',true,2),
  ('seed_bundle_mtn_4','MTN',4,21,0,'No expiry',true,3),
  ('seed_bundle_mtn_5','MTN',5,26,0,'No expiry',true,4),
  ('seed_bundle_mtn_6','MTN',6,31,0,'No expiry',true,5),
  ('seed_bundle_mtn_8','MTN',8,40,0,'No expiry',true,6),
  ('seed_bundle_mtn_10','MTN',10,48,0,'No expiry',true,7),
  ('seed_bundle_mtn_15','MTN',15,70,0,'No expiry',true,8),
  ('seed_bundle_mtn_20','MTN',20,90,0,'No expiry',true,9),
  ('seed_bundle_mtn_25','MTN',25,112,0,'No expiry',true,10),
  ('seed_bundle_mtn_30','MTN',30,132,0,'No expiry',true,11),
  ('seed_bundle_mtn_40','MTN',40,175,0,'No expiry',true,12),
  ('seed_bundle_mtn_50','MTN',50,215,0,'No expiry',true,13),
  ('seed_bundle_mtn_100','MTN',100,425,0,'No expiry',true,14),
  ('seed_bundle_telecel_5','TELECEL',5,26,0,'No expiry',true,15),
  ('seed_bundle_telecel_10','TELECEL',10,47,0,'No expiry',true,16),
  ('seed_bundle_telecel_15','TELECEL',15,68,0,'No expiry',true,17),
  ('seed_bundle_telecel_20','TELECEL',20,88,0,'No expiry',true,18),
  ('seed_bundle_telecel_25','TELECEL',25,108,0,'No expiry',true,19),
  ('seed_bundle_telecel_30','TELECEL',30,128,0,'No expiry',true,20),
  ('seed_bundle_telecel_40','TELECEL',40,170,0,'No expiry',true,21),
  ('seed_bundle_telecel_50','TELECEL',50,210,0,'No expiry',true,22),
  ('seed_bundle_telecel_100','TELECEL',100,415,0,'No expiry',true,23),
  ('seed_bundle_airteltigo_ishare_1','AIRTELTIGO_ISHARE',1,5,0,'No expiry',true,24),
  ('seed_bundle_airteltigo_ishare_2','AIRTELTIGO_ISHARE',2,9,0,'No expiry',true,25),
  ('seed_bundle_airteltigo_ishare_3','AIRTELTIGO_ISHARE',3,14,0,'No expiry',true,26),
  ('seed_bundle_airteltigo_ishare_4','AIRTELTIGO_ISHARE',4,18,0,'No expiry',true,27),
  ('seed_bundle_airteltigo_ishare_5','AIRTELTIGO_ISHARE',5,22,0,'No expiry',true,28),
  ('seed_bundle_airteltigo_ishare_6','AIRTELTIGO_ISHARE',6,26,0,'No expiry',true,29),
  ('seed_bundle_airteltigo_ishare_8','AIRTELTIGO_ISHARE',8,34,0,'No expiry',true,30),
  ('seed_bundle_airteltigo_ishare_10','AIRTELTIGO_ISHARE',10,41,0,'No expiry',true,31),
  ('seed_bundle_airteltigo_ishare_15','AIRTELTIGO_ISHARE',15,60,0,'No expiry',true,32),
  ('seed_bundle_airteltigo_ishare_20','AIRTELTIGO_ISHARE',20,79,0,'No expiry',true,33),
  ('seed_bundle_airteltigo_ishare_25','AIRTELTIGO_ISHARE',25,98,0,'No expiry',true,34),
  ('seed_bundle_airteltigo_ishare_30','AIRTELTIGO_ISHARE',30,117,0,'No expiry',true,35),
  ('seed_bundle_airteltigo_ishare_40','AIRTELTIGO_ISHARE',40,155,0,'No expiry',true,36),
  ('seed_bundle_airteltigo_ishare_50','AIRTELTIGO_ISHARE',50,192,0,'No expiry',true,37),
  ('seed_bundle_airteltigo_ishare_100','AIRTELTIGO_ISHARE',100,380,0,'No expiry',true,38),
  ('seed_bundle_airteltigo_bigtime_25','AIRTELTIGO_BIGTIME',25,60,0,'No expiry',true,39),
  ('seed_bundle_airteltigo_bigtime_50','AIRTELTIGO_BIGTIME',50,95,0,'No expiry',true,40),
  ('seed_bundle_airteltigo_bigtime_75','AIRTELTIGO_BIGTIME',75,130,0,'No expiry',true,41),
  ('seed_bundle_airteltigo_bigtime_100','AIRTELTIGO_BIGTIME',100,160,0,'No expiry',true,42)
) AS seed
WHERE NOT EXISTS (SELECT 1 FROM "DataBundle");

-- 5) Storefront settings. ON CONFLICT DO NOTHING so an existing value you've
--    already tuned in the admin is left alone.
INSERT INTO "SiteSetting" ("key","value") VALUES
  ('dataBundlesUrl','/data-bundles'),
  ('dataBundlesEnabled','1'),
  ('dataStoreName','NikiMart Data'),
  ('dataStoreTagline','MTN, Telecel & AirtelTigo bundles — delivered in seconds.'),
  ('dataSupportWhatsapp',''),
  ('dataAfaEnabled','1'),
  ('dataAfaPrice','12'),
  ('dataMarkupPercent','25'),
  ('dataLowBalanceThreshold','50')
ON CONFLICT ("key") DO NOTHING;

-- 6) Repoint the seeded carousel slide (and any banner still pointing at the
--    external agent storefront) at NikiMart's own bundle page.
UPDATE "Banner"
   SET "ctaHref" = '/data-bundles'
 WHERE "ctaHref" LIKE '%4ubundles.store%';

UPDATE "SiteSetting"
   SET "value" = '/data-bundles'
 WHERE "key" = 'dataBundlesUrl'
   AND "value" LIKE '%4ubundles.store%';
