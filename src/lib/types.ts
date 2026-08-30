export type SellerType =
  | "local_shop"
  | "preorder_seller"
  | "campus_vendor"
  | "food_vendor"
  | "service_provider"
  | "wholesale_supplier"
  | "official_partner";

export const SELLER_TYPE_LABELS: Record<SellerType, string> = {
  local_shop: "Local Shop",
  // The value is unchanged so existing shops keep their type; only the name
  // the world sees moved on from "preorder".
  preorder_seller: "Shipped-from-Abroad Seller",
  campus_vendor: "Campus Vendor",
  food_vendor: "Food Vendor",
  service_provider: "Service Provider",
  wholesale_supplier: "Wholesale Supplier",
  official_partner: "Nickimart Official Partner",
};

export type VerificationStatus = "pending" | "verified" | "rejected";

/**
 * `preorder` is the legacy spelling of `shipped_from_abroad` and still sits on
 * every listing created before the rename. Read both; write the new one. See
 * lib/abroad for the helpers that reconcile them.
 */
export type ProductType = "in_stock" | "shipped_from_abroad" | "preorder" | "service" | "food";

/**
 * Where a shipped-from-abroad listing's consignment has got to.
 *
 * There is no "closed" any more: ordering never shuts, which is the whole
 * difference between this and the preorder system it replaces. What a buyer
 * tracks now is the journey, not a window.
 */
export type AbroadStatus =
  | "open"
  | "sourcing"
  | "in_transit"
  | "arrived"
  | "cancelled";

export type BadgeKind =
  | "in_stock"
  | "shipped_from_abroad"
  | "same_day_delivery"
  | "pickup_available"
  | "campus_delivery"
  | "verified_seller"
  | "official"
  | "deposit_required"
  | "imported_item"
  | "local_shop"
  | "service"
  | "limited_stock"
  | "flash_sale"
  | "food_vendor"
  | "top_rated";

export const BADGE_LABELS: Record<BadgeKind, string> = {
  in_stock: "In Stock",
  shipped_from_abroad: "Shipped from Abroad",
  same_day_delivery: "Same-Day Delivery",
  pickup_available: "Pickup Available",
  campus_delivery: "Campus Delivery",
  verified_seller: "Verified Seller",
  official: "Nickimart Official",
  deposit_required: "Deposit Required",
  imported_item: "Imported Item",
  local_shop: "Local Shop",
  service: "Service",
  limited_stock: "Limited Stock",
  flash_sale: "Flash Sale",
  food_vendor: "Food Vendor",
  top_rated: "Top Rated",
};

export type LocationType =
  | "city"
  | "town"
  | "campus"
  | "institution"
  | "community";

export interface Location {
  id: string;
  name: string;
  type: LocationType;
  region: string;
  isActive: boolean;
  /** Delivery-fee zone multiplier (1 = standard; <1 nearer, >1 farther). */
  deliveryZoneMultiplier?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
  productCount: number;
  /** Per-category commission override (percent). Null/undefined = platform default. */
  commissionRate?: number | null;
  /** Default affiliate commission for the category (percent). Null = programme default. */
  affiliateCommissionRate?: number | null;
}

export interface Vendor {
  id: string;
  slug: string;
  businessName: string;
  sellerTypes: SellerType[];
  description: string;
  initials: string;
  accentFrom: string;
  accentTo: string;
  locationIds: string[];
  originCountry: string;
  verificationStatus: VerificationStatus;
  rating: number;
  reviewCount: number;
  totalSales: number;
  isOfficial: boolean;
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  sameDayDeliveryAvailable: boolean;
  /** Square shop logo (http(s) or data: URL). */
  logoUrl?: string;
  /** Wide cover banner (http(s) or data: URL). */
  bannerUrl?: string;
  /** Seller's WhatsApp number for the "Chat on WhatsApp" button. */
  whatsapp?: string;
}

/**
 * The stored terms of a shipped-from-abroad listing, as the storefront reads
 * them off the JSON column. Loose on purpose: a legacy preorder record has only
 * a handful of these, and `parseAbroadTerms` in lib/abroad is what narrows
 * either shape into the strict `AbroadTerms` the forms and pricing work on.
 */
export interface AbroadInfo {
  estimatedArrival?: string;
  depositRequired?: boolean;
  depositType?: "percentage" | "fixed_amount";
  depositValue?: number;
  balanceInstruction?: string;
  refundPolicy?: string;
  sourceLocation?: string;
  sourceUrl?: string;
  supplierName?: string;
  originCountry?: string;
  freightMode?: string;
  arrivalPointId?: string;
  supplierFreight?: number;
  intlFreight?: number;
  freightIncluded?: boolean;
  originTaxRate?: number;
  ghanaTaxRate?: number;
  dutyIncluded?: boolean;
  allowFreightOnArrival?: boolean;
  processingDays?: number;
  abroadStatus?: AbroadStatus;
  minimumOrders?: number;
  /** Legacy preorder field. Read only; nothing writes it any more. */
  closingDate?: string;
}

export interface ServiceInfo {
  serviceArea: string;
  availability: string;
  priceType: "fixed" | "range" | "quote";
  minPrice?: number;
  maxPrice?: number;
  bookingNotes: string;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  vendorId: string;
  description: string;
  price: number;
  oldPrice?: number;
  stockQuantity: number;
  productType: ProductType;
  badges: BadgeKind[];
  locationIds: string[];
  campusDeliveryAvailable: boolean;
  pickupAvailable: boolean;
  sameDayDeliveryAvailable: boolean;
  isOfficial: boolean;
  isFeatured: boolean;
  rating: number;
  reviewCount: number;
  gradientFrom: string;
  gradientTo: string;
  emoji: string;
  /** Billable shipping weight in kg, used by the delivery-fee engine. */
  shippingWeightKg?: number;
  /** Parcel dimensions in cm, used to derive the CBM when not set directly. */
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  /** Shipping volume in cubic metres (CBM) — the basis of the shipping fee. */
  cbm?: number;
  /**
   * Optional product image. Set this to override the default photo.
   * Accepts a local path served from /public (e.g. "/products/my-photo.jpg")
   * or any absolute URL (e.g. "https://...").
   * When omitted, the app falls back to /products/<slug>.jpg, and if that
   * file is missing it gracefully shows the gradient + emoji placeholder.
   */
  image?: string;
  /** Gallery image URLs (http(s) or data: URLs). First is the primary. */
  images?: string[];
  /**
   * Origin country code. The listing's own when it sets one — a seller in Accra
   * dropshipping from Guangzhou has a GH shop and a CN product — otherwise
   * inherited from the vendor. GH = local.
   */
  originCountry?: string;
  /** The supplier listing this was copied from (Alibaba, 1688, Amazon…). */
  sourceUrl?: string;
  supplierName?: string;
  /** air | sea | road | express, for the abroad → Ghana leg. */
  freightMode?: string;
  /** The Ghana arrival point this listing lands at. */
  arrivalPointId?: string | null;
  /** True when the listed price already covers freight into Ghana. */
  freightIncluded?: boolean;
  /** Key attributes / spec table rows. */
  attributes?: KeyAttribute[];
  /** Offered to affiliate marketers? */
  affiliateEnabled?: boolean;
  /** Who enrolled it and funds the commission: "seller" | "admin" | "". */
  affiliateEnrolledBy?: string;
  /** Per-product affiliate commission override (percent). Null = inherit. */
  affiliateCommissionRate?: number | null;
  /** Archived products stay in reports but leave the storefront. */
  isArchived?: boolean;
  /**
   * Shipped-from-abroad terms. The property keeps its old name because the
   * database column does; see lib/abroad.
   */
  preorderInfo?: AbroadInfo;
  serviceInfo?: ServiceInfo;
}

export interface KeyAttribute {
  label: string;
  value: string;
}
