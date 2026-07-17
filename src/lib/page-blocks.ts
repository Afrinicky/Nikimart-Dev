// Section-block system for the page builder. Defines the available block types,
// their editable fields (for the admin editor), and the default homepage
// composition used as a fallback when no DB page exists yet.

export type SectionType =
  | "hero"
  | "global_band"
  | "category_grid"
  | "product_rail"
  | "vendor_rail"
  | "campus"
  | "rich_text"
  | "banner";

export interface SectionConfig {
  title?: string;
  subtitle?: string;
  collection?: string; // product_rail
  filter?: string; // vendor_rail
  viewAllHref?: string;
  tone?: "light" | "dark";
  icon?: string;
  body?: string; // rich_text
  text?: string; // banner
  showCountdown?: boolean;
  notice?: string;
}

export interface SectionInput {
  type: SectionType;
  config: SectionConfig;
  isVisible?: boolean;
}

// Product collections a product_rail can bind to.
export const COLLECTIONS = [
  { value: "featured", label: "Featured" },
  { value: "flash_sale", label: "Flash sale" },
  { value: "preorder", label: "Preorders" },
  { value: "service", label: "Services" },
  { value: "food", label: "Food" },
  { value: "official", label: "Official store" },
  { value: "budget", label: "Budget (≤ GH₵100)" },
  { value: "recently_viewed", label: "Recently viewed" },
] as const;

// Vendor filters a vendor_rail can bind to.
export const VENDOR_FILTERS = [
  { value: "all", label: "All shops" },
  { value: "local_shop", label: "Local shops" },
  { value: "top_rated", label: "Top rated" },
] as const;

type FieldType = "text" | "textarea" | "collection" | "vendorFilter" | "tone" | "icon" | "bool";

interface FieldDef {
  name: keyof SectionConfig;
  label: string;
  type: FieldType;
  hint?: string;
}

export interface BlockDef {
  type: SectionType;
  label: string;
  description: string;
  fields: FieldDef[];
}

// The palette of blocks and which fields the admin can edit for each.
export const BLOCK_DEFS: BlockDef[] = [
  { type: "hero", label: "Hero banner", description: "The big top banner.", fields: [] },
  { type: "global_band", label: "Global sourcing band", description: "Strip of source regions.", fields: [] },
  { type: "category_grid", label: "Category grid", description: "Shop-by-category tiles.", fields: [] },
  { type: "campus", label: "Campus showcase", description: "Location-aware vendors & products.", fields: [] },
  {
    type: "product_rail",
    label: "Product rail",
    description: "A horizontal row of products from a collection.",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "subtitle", label: "Subtitle", type: "text" },
      { name: "collection", label: "Products from", type: "collection" },
      { name: "icon", label: "Icon", type: "icon" },
      { name: "viewAllHref", label: "“View all” link", type: "text" },
      { name: "tone", label: "Background", type: "tone" },
      { name: "showCountdown", label: "Show flash-sale countdown", type: "bool" },
      { name: "notice", label: "Notice banner (optional)", type: "textarea" },
    ],
  },
  {
    type: "vendor_rail",
    label: "Shop rail",
    description: "A horizontal row of shops.",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "subtitle", label: "Subtitle", type: "text" },
      { name: "filter", label: "Shops", type: "vendorFilter" },
      { name: "icon", label: "Icon", type: "icon" },
      { name: "viewAllHref", label: "“View all” link", type: "text" },
    ],
  },
  {
    type: "banner",
    label: "Highlight banner",
    description: "A simple call-out banner.",
    fields: [
      { name: "title", label: "Title", type: "text" },
      { name: "text", label: "Text", type: "textarea" },
      { name: "tone", label: "Background", type: "tone" },
    ],
  },
  {
    type: "rich_text",
    label: "Rich text",
    description: "A heading and paragraph(s) of text.",
    fields: [
      { name: "title", label: "Heading", type: "text" },
      { name: "body", label: "Body", type: "textarea" },
    ],
  },
];

export function blockDef(type: string): BlockDef | undefined {
  return BLOCK_DEFS.find((b) => b.type === type);
}

// Icons available to section headings (kept small + curated).
export const SECTION_ICONS = [
  "zap", "clock", "store", "badge-check", "shield", "wrench",
  "utensils", "wallet", "history", "star", "sparkles", "package",
] as const;

// The default homepage — mirrors the original hardcoded layout. Used as a
// fallback and as the seed for the editable "home" page.
// Homepage order is products-first: a short hero, then real products right
// away (so mobile shoppers see items without scrolling past banners), a compact
// category strip for navigation, and the promotional bands lower down.
export const DEFAULT_HOME_SECTIONS: SectionInput[] = [
  { type: "hero", config: {} },
  {
    type: "product_rail",
    config: {
      title: "Flash Sales",
      subtitle: "Grab these deals before they're gone",
      collection: "flash_sale",
      viewAllHref: "/products?badge=flash_sale",
      icon: "zap",
      showCountdown: true,
    },
  },
  {
    type: "product_rail",
    config: {
      title: "Featured Picks",
      subtitle: "Hand-picked products our team loves right now",
      collection: "featured",
      viewAllHref: "/products",
      icon: "star",
    },
  },
  {
    type: "product_rail",
    config: {
      title: "Preorder Deals",
      subtitle: "Discover imported and upcoming products from trusted sellers",
      collection: "preorder",
      viewAllHref: "/preorders",
      icon: "clock",
      notice:
        "This is a preorder item. Please review the estimated arrival date, deposit requirement, balance payment rule, and refund policy before placing your order.",
    },
  },
  { type: "category_grid", config: {} },
  { type: "global_band", config: {} },
  {
    type: "vendor_rail",
    config: {
      title: "Local Shops Near You",
      subtitle: "Trusted neighbourhood shops ready to deliver or meet you for pickup",
      filter: "local_shop",
      viewAllHref: "/shops",
      icon: "store",
    },
  },
  { type: "campus", config: {} },
  {
    type: "product_rail",
    config: {
      title: "NikiMart Official Store",
      subtitle: "Verified, NikiMart-branded products you can always trust",
      collection: "official",
      viewAllHref: "/categories/nikimart-official-store",
      icon: "badge-check",
      tone: "dark",
    },
  },
  {
    type: "vendor_rail",
    config: {
      title: "Top Rated Vendors",
      subtitle: "Sellers our community trusts and loves",
      filter: "top_rated",
      viewAllHref: "/shops",
      icon: "shield",
    },
  },
  {
    type: "product_rail",
    config: {
      title: "Services Near You",
      subtitle: "Book trusted professionals for everyday tasks",
      collection: "service",
      viewAllHref: "/services",
      icon: "wrench",
    },
  },
  {
    type: "product_rail",
    config: {
      title: "Food Near You",
      subtitle: "Fresh meals from vendors close to you",
      collection: "food",
      viewAllHref: "/products?category=food-drinks",
      icon: "utensils",
    },
  },
  {
    type: "product_rail",
    config: {
      title: "Student Budget Zone",
      subtitle: "Quality picks under GH₵100",
      collection: "budget",
      viewAllHref: "/products?maxPrice=100",
      icon: "wallet",
    },
  },
  {
    type: "product_rail",
    config: {
      title: "Recently Viewed",
      subtitle: "Pick up where you left off",
      collection: "recently_viewed",
      icon: "history",
    },
  },
];

export const DEFAULT_ABOUT_SECTIONS: SectionInput[] = [
  {
    type: "rich_text",
    config: {
      title: "About NikiMart",
      body:
        "NikiMart connects buyers to trusted local shops, preorder sellers, campus vendors, service providers, and official NikiMart products across Ghana. Our mission is to make everyday shopping closer, safer, and simpler — whether you're on campus, in town, or ordering from abroad.",
    },
  },
  {
    type: "banner",
    config: {
      title: "Selling on NikiMart",
      text: "Reach more customers near you. Register your shop and start listing products, preorders, or services today.",
      tone: "dark",
    },
  },
];
