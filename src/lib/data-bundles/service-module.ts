import type { ModuleTab } from "@/components/admin/ModuleTabs";

/**
 * The Products module's tabs.
 *
 * Six, and each one is a different question: what is for sale, what has been
 * ordered, who ordered it, what they sent us, how a share looks, and where the
 * shelf is shown. They are a pure list so a server page can render them
 * without pulling the client component's own module in.
 */
export function SERVICE_MODULE_TABS(counts: { open?: number; documents?: number } = {}): ModuleTab[] {
  return [
    { href: "/admin/data/products", label: "Products", icon: "package", exact: true },
    { href: "/admin/data/products/orders", label: "Orders", icon: "inbox", badge: counts.open },
    { href: "/admin/data/products/customers", label: "Customers", icon: "users" },
    { href: "/admin/data/products/documents", label: "Documents", icon: "file", badge: counts.documents },
    { href: "/admin/data/products/flyer", label: "Flyer", icon: "image" },
    { href: "/admin/data/products/settings", label: "Settings", icon: "settings" },
  ];
}
