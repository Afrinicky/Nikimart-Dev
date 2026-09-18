// The pager is not about orders — it is the same strip under every console
// table. It lives in components/admin/TablePager and is re-exported here so
// the orders pages, which had it first, keep the name they import.
export { TablePager as OrderPager, PER_PAGE_OPTIONS } from "@/components/admin/TablePager";
