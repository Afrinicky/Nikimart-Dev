/**
 * Who may reach what in the medical console.
 *
 * Separate from the retail `Role` because the jobs are different. The person
 * who prices a quotation is rarely the person who receives goods at the door,
 * and neither should be able to edit a payment plan. Retail's five roles
 * cannot express that, and bending them to try would change a model three
 * businesses share.
 *
 * Pure, so it can be tested and so the sidebar and the page guard cannot
 * disagree about what somebody may see — a menu that offers a section the
 * page then refuses is worse than no menu.
 */

export const MEDICAL_ROLES = [
  "OWNER",
  "MANAGER",
  "SALES",
  "PROCUREMENT",
  "STORES",
  "FINANCE",
  "SUPPORT",
] as const;

export type MedicalRole = (typeof MEDICAL_ROLES)[number];

export const MEDICAL_ROLE_LABELS: Record<MedicalRole, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SALES: "Sales",
  PROCUREMENT: "Procurement",
  STORES: "Stores",
  FINANCE: "Finance",
  SUPPORT: "Support",
};

export const MEDICAL_ROLE_DESCRIPTIONS: Record<MedicalRole, string> = {
  OWNER: "Everything, including staff and settings.",
  MANAGER: "Everything operational. Not staff or settings.",
  SALES: "Quotations, tenders, customers and orders.",
  PROCUREMENT: "Suppliers, sourcing, purchase orders and supplier pricing.",
  STORES: "Inventory, goods received and dispatch.",
  FINANCE: "Payments, payables, expenses and reporting.",
  SUPPORT: "Customers and support requests, read-only elsewhere.",
};

export function isMedicalRole(value: unknown): value is MedicalRole {
  return typeof value === "string" && (MEDICAL_ROLES as readonly string[]).includes(value);
}

/**
 * The console's sections, and who may open each one.
 *
 * Keyed by the first path segment under `/medicals/admin`. The empty key is
 * the overview, which everybody with a staff account can see.
 *
 * OWNER is not listed on each line; it is allowed everywhere by `canReach`.
 * Spelling it out on every row is how one gets missed.
 */
export const SECTION_ACCESS: Record<string, MedicalRole[]> = {
  "": ["MANAGER", "SALES", "PROCUREMENT", "STORES", "FINANCE", "SUPPORT"],

  // Selling
  tenders: ["MANAGER", "SALES"],
  institutions: ["MANAGER", "SALES", "SUPPORT"],
  quotations: ["MANAGER", "SALES"],
  "customer-orders": ["MANAGER", "SALES", "FINANCE"],
  "customer-purchase-orders": ["MANAGER", "SALES", "FINANCE"],

  // Buying
  suppliers: ["MANAGER", "PROCUREMENT", "FINANCE"],
  sourcing: ["MANAGER", "PROCUREMENT", "SALES"],
  "supplier-quotes": ["MANAGER", "PROCUREMENT"],
  "purchase-orders": ["MANAGER", "PROCUREMENT", "FINANCE"],
  "goods-received": ["MANAGER", "PROCUREMENT", "STORES"],
  payables: ["MANAGER", "FINANCE"],

  // Holding
  inventory: ["MANAGER", "STORES", "PROCUREMENT"],
  products: ["MANAGER", "SALES", "PROCUREMENT"],

  // Running it
  settings: [],
  staff: [],
  audit: ["MANAGER"],
};

/** The section a console path belongs to: "/medicals/admin/tenders/x" → "tenders". */
export function sectionOf(pathname: string): string {
  const rest = pathname.replace(/^\/medicals\/admin\/?/, "").replace(/\/+$/, "");
  if (!rest) return "";
  return rest.split("/")[0] ?? "";
}

export function canReach(role: MedicalRole, pathname: string): boolean {
  if (role === "OWNER") return true;
  const section = sectionOf(pathname);
  const allowed = SECTION_ACCESS[section];
  // An unknown section is closed, not open. A new page added without a line in
  // the table above should 404 for everyone rather than be visible to all —
  // the failure that is noticed immediately beats the one that is not.
  if (!allowed) return false;
  return allowed.includes(role);
}

/** Whether a role may see a section at all, for building the sidebar. */
export function canSeeSection(role: MedicalRole, section: string): boolean {
  if (role === "OWNER") return true;
  return (SECTION_ACCESS[section] ?? []).includes(role);
}

/**
 * Internal cost, supplier identity and sourcing route.
 *
 * Sales can quote a price without ever seeing what it cost us, and support
 * never needs to. The customer-facing selects already exclude these columns;
 * this is the second gate, for the console itself.
 */
export function canSeeCost(role: MedicalRole): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "PROCUREMENT" || role === "FINANCE";
}

/** Whether a role may approve a purchase order or release a supplier payment. */
export function canApproveSpending(role: MedicalRole): boolean {
  return role === "OWNER" || role === "MANAGER" || role === "FINANCE";
}
