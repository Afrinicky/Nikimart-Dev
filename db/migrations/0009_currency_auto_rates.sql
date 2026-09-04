-- Exchange rates that keep themselves current.
--
-- The rate a forwarder's dollars are converted at was a number somebody typed.
-- It is the single most load-bearing figure in the imported system — every
-- listing quoted in a foreign currency moves with it — and it was also the one
-- most likely to be months old, because nothing anywhere said it had gone
-- stale. A rate nobody has corrected since the cedi last moved quietly
-- under-quotes every sea container on the platform.
--
-- So rates are fetched instead. `autoUpdate` is what the refresh is allowed to
-- touch: turn it off for a currency somebody has a reason to pin by hand, and
-- the fetch leaves it alone. `source` records where the figure came from, so
-- "12.4" on the screen can be told apart from "12.4, fetched this morning".

ALTER TABLE "Currency" ADD COLUMN IF NOT EXISTS "autoUpdate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Currency" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT '';
