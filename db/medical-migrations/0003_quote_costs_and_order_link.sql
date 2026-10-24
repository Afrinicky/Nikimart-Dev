-- Nickimart Medical — make the supplier-quotation comparison a landed-cost
-- comparison, and record which quotation an order was placed against.
--
-- Two things, one file, because they are one change: a comparison nobody can
-- trace back to the order it produced is a screen, not a record.
--
--   1. Six columns on supplier quotations. Without them a "landed cost"
--      comparison is a currency conversion wearing the wrong name: two offers
--      at the same converted goods value can differ by a third once freight,
--      duty on the CIF value and clearing are counted, and the cheaper unit
--      price is routinely the dearer shelf. The arithmetic already existed and
--      was tested; only the storage was missing.
--   2. One nullable column on purchase orders, naming the quotation the order
--      was priced from. "Why did we pay this" is exactly the question a
--      procurement record exists to answer.
--
-- Purely additive. Every column is NOT NULL with a default or nullable, so
-- each is safe against a table that already holds rows. No DROP, no ALTER
-- COLUMN, no TRUNCATE, and nothing that rewrites a row: an order raised before
-- this migration simply has no quotation recorded against it, which is the
-- truth, and a quotation entered before it carries no charges, which is also
-- the truth.
--
-- Re-runnable: IF NOT EXISTS on every column and index, and the foreign key is
-- attempted inside a block that swallows a duplicate and nothing else.
--
-- Applied against MEDICAL_DATABASE_URL only. Touches no retail or data-bundle
-- table.

-- AlterTable: what a supplier's offer costs between their gate and our shelf.
-- Freight, insurance and their other charges are in the supplier's own
-- currency; clearing and the inland charges are in GH₵, because they are paid
-- here in cedis and running them through the supplier's rate would invent a
-- figure. Duty is a rate in basis points of the CIF value rather than an
-- amount, because the amount depends on the goods value and the goods value is
-- what the comparison varies.
ALTER TABLE "medical_supplier_quotes"
  ADD COLUMN IF NOT EXISTS "freight"      DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "insurance"    DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "otherCharges" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dutyRateBp"   INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clearingGhs"  DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "otherGhs"     DECIMAL(14,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "medical_purchase_orders"
  ADD COLUMN IF NOT EXISTS "supplierQuoteId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "medical_purchase_orders_supplierQuoteId_idx"
  ON "medical_purchase_orders" ("supplierQuoteId");

-- AddForeignKey. SET NULL rather than CASCADE: deleting a quotation must never
-- delete the order that was placed from it.
DO $$
BEGIN
  ALTER TABLE "medical_purchase_orders"
    ADD CONSTRAINT "medical_purchase_orders_supplierQuoteId_fkey"
    FOREIGN KEY ("supplierQuoteId") REFERENCES "medical_supplier_quotes"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Rename the top medical role from OWNER to ADMIN.
--
-- The role is a plain string column validated by src/lib/medical/roles.ts, so a
-- row still saying OWNER after the rename is a staff member the console refuses
-- to admit: `isMedicalRole` no longer recognises the word and
-- `requireMedicalStaff` turns them away. A fresh database has no such rows and
-- this does nothing; a database that was set up before the rename has them and
-- this is the only thing that fixes them.
--
-- Safe to re-run: after the first pass there is nothing left matching.
UPDATE "medical_staff" SET "role" = 'ADMIN' WHERE "role" = 'OWNER';
