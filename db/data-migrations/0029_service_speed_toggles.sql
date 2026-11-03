-- 0029 — standard and fast track, each switchable.
--
-- Some of this paperwork Nickimart will only do expedited, and some of it has
-- no faster lane at all. Until now every option offered a standard speed
-- whether or not anybody would serve it, and a fast track could only be taken
-- away by deleting it — which also threw away its fee and its turnaround.
--
-- Two switches, in the two places they belong. Whether the ordinary speed is
-- offered is a column, because it is a fact about the option. Whether one
-- faster lane is open rides inside the `speeds` JSON alongside that lane's own
-- fee and turnaround, so suspending it keeps everything about it (see
-- src/lib/data-bundles/service-fields.ts, where an absent flag reads as on —
-- every row written before today is a row where both were on).

ALTER TABLE "DataServiceVariant"
  ADD COLUMN IF NOT EXISTS "standardEnabled" BOOLEAN NOT NULL DEFAULT true;
