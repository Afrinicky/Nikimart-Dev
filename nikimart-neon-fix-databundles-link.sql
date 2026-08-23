-- NikiMart — repair the "Buy Data Bundles" link.
--
-- The route is /data-bundles. A value of /databundles (or any unhyphenated
-- spelling) sends the sidebar, footer and carousel to a 404. The app also
-- repairs this on read, so this statement is belt-and-braces: it stops the bad
-- value showing in the admin settings field.
--
-- Safe to run more than once.

UPDATE "SiteSetting"
   SET "value" = '/data-bundles'
 WHERE "key" = 'dataBundlesUrl'
   AND "value" !~* '^https?://'
   AND lower(regexp_replace("value", '[^a-zA-Z]', '', 'g')) = 'databundles';

-- Any banner CTA that picked up the same typo.
UPDATE "Banner"
   SET "ctaHref" = '/data-bundles'
 WHERE "ctaHref" !~* '^https?://'
   AND lower(regexp_replace("ctaHref", '[^a-zA-Z]', '', 'g')) = 'databundles';
