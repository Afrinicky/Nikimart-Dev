-- 0011 — find the old one-class-per-category constraint by shape, not by name.
--
-- 0010 dropped it by the two names this repository has ever given it. That is
-- not enough: a unique index can also be created as a table constraint, in
-- which case DROP INDEX refuses it and only ALTER TABLE ... DROP CONSTRAINT
-- will do, and a database that was set up by hand, restored from a dump, or
-- pushed straight from the Prisma schema may carry it under a name nobody
-- here has seen. Saving a category into two classes then failed with no
-- symptom worth the name — one row went in, the other was dropped, and the
-- save reported success.
--
-- So this looks for what the constraint *is* rather than what it is called:
-- any unique index on ForwarderCategoryMap over exactly (forwarderId,
-- categoryId), whatever its name, dropped through its constraint when it has
-- one. The three-column index that replaces it has a different shape and is
-- left alone, which is what makes a rerun a no-op.

DO $$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT i.relname AS index_name, c.conname AS constraint_name
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    LEFT JOIN pg_constraint c ON c.conindid = x.indexrelid
    WHERE t.relname = 'ForwarderCategoryMap'
      AND n.nspname = current_schema()
      AND x.indisunique
      AND x.indnatts = 2
      AND x.indpred IS NULL
      AND (
        SELECT array_agg(a.attname ORDER BY a.attname)
        FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attnum = ANY (string_to_array(x.indkey::text, ' ')::smallint[])
      ) = ARRAY['categoryId', 'forwarderId']::name[]
  LOOP
    IF target.constraint_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I DROP CONSTRAINT %I', 'ForwarderCategoryMap', target.constraint_name);
      RAISE NOTICE 'dropped constraint %', target.constraint_name;
    ELSE
      EXECUTE format('DROP INDEX %I', target.index_name);
      RAISE NOTICE 'dropped index %', target.index_name;
    END IF;
  END LOOP;
END $$;

-- One row per class a category falls into. Created here too, so a database
-- that reached this file without 0010 having taken effect still ends up right.
CREATE UNIQUE INDEX IF NOT EXISTS "ForwarderCategoryMap_scope_key"
  ON "ForwarderCategoryMap"("forwarderId", "categoryId", "goodsClassId");
