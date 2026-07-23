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
  preorder_seller: "Preorder Seller",
  campus_vendor: "Campus Vendor",
  food_vendor: "Food Vendor",
  service_provider: "Service Provider",
  wholesale_supplier: "Wholesale Supplier",
  official_partner: "NikiMart Official Partner",
};

export type VerificationStatus = "pending" | "verified" | "rejected";

export type ProductType = "in_stock" | "preorder" | "service" | "food";

export type PreorderStatus =
  | "open"
  | "closing_soon"
  | "closed"
  | "arrived"
  | "cancelled";

export type BadgeKind =
  | "in_stock"
  | "preorder"
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
  preorder: "Preorder",
  same_day_delivery: "Same-Day Delivery",
  pickup_available: "Pickup Available",
  campus_delivery: "Campus Delivery",
  verified_seller: "Verified Seller",
  official: "NikiMart Official",
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
}

export interface PreorderInfo {
  estimatedArrival: string;
  closingDate: string;
  depositRequired: boolean;
  depositType: "percentage" | "fixed_amount";
  depositValue: number;
  balanceInstruction: string;
  refundPolicy: string;
  sourceLocation: string;
  preorderStatus: PreorderStatus;
  minimumOrders?: number;
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
  /** Origin country code inherited from the vendor (GH = local). */
  originCountry?: string;
  /** Key attributes / spec table rows. */
  attributes?: KeyAttribute[];
  preorderInfo?: PreorderInfo;
  serviceInfo?: ServiceInfo;
}

export interface KeyAttribute {
  label: string;
  value: string;
}
