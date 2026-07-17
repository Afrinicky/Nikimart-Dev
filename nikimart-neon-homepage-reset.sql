-- NikiMart — optional homepage reset for Neon.
--
-- The homepage layout is products-first by default (defined in code:
-- DEFAULT_HOME_SECTIONS). The app uses that default automatically UNLESS a
-- "home" page row exists in the database — which only happens if an admin has
-- opened the page builder (/admin/pages), seeding the OLD order into the DB.
--
-- If your storefront still shows the old order after deploying, it means a
-- stale "home" page is overriding the new default. Run this to drop it so the
-- new products-first layout takes over. (Its sections cascade-delete. The page
-- builder will re-create "home" from the new default the next time it's opened,
-- so nothing is lost — you can still customise it afterwards.)
--
-- Safe to run more than once. Does nothing if no "home" page exists.

DELETE FROM "Page" WHERE "slug" = 'home';
