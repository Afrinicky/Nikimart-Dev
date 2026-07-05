// Data + helpers for NikiMart's global-shopping / buy-for-me / freight / pickup
// features. Mock data for now; replaced with Prisma-backed data in a later phase.

export interface SourceRegion {
  id: string;
  name: string;
  flag: string;
  tagline: string;
  highlights: string[];
  deliveryEstimate: string;
  accentFrom: string;
  accentTo: string;
}

export const sourceRegions: SourceRegion[] = [
  {
    id: "ghana",
    name: "Ghana",
    flag: "🇬🇭",
    tagline: "Local shops & vendors near you",
    highlights: ["Same-day & next-day delivery", "Campus & community pickup", "Pay on delivery options"],
    deliveryEstimate: "Same day – 3 days",
    accentFrom: "#16a34a",
    accentTo: "#0e1f36",
  },
  {
    id: "china",
    name: "China",
    flag: "🇨🇳",
    tagline: "Electronics, gadgets & wholesale",
    highlights: ["Best prices on gadgets", "Wholesale & bulk buys", "Huge product range"],
    deliveryEstimate: "2 – 4 weeks",
    accentFrom: "#ef4444",
    accentTo: "#122a47",
  },
  {
    id: "dubai",
    name: "Dubai / UAE",
    flag: "🇦🇪",
    tagline: "Fashion, watches & fragrances",
    highlights: ["Premium fashion & beauty", "Authentic watches", "Fast Gulf freight"],
    deliveryEstimate: "1 – 3 weeks",
    accentFrom: "#ff8a00",
    accentTo: "#07111f",
  },
  {
    id: "usa",
    name: "USA",
    flag: "🇺🇸",
    tagline: "Top brands & the latest tech",
    highlights: ["Brand-name goods", "Latest phones & laptops", "Black Friday deals"],
    deliveryEstimate: "2 – 4 weeks",
    accentFrom: "#0ea5e9",
    accentTo: "#07111f",
  },
  {
    id: "europe",
    name: "Europe",
    flag: "🇪🇺",
    tagline: "Quality goods & UK-used items",
    highlights: ["Quality European goods", "UK-used electronics", "Trusted sellers"],
    deliveryEstimate: "2 – 4 weeks",
    accentFrom: "#122a47",
    accentTo: "#ff8a00",
  },
];

export interface PickupPoint {
  id: string;
  name: string;
  region: string;
  hours: string;
  otpSecured: boolean;
}

export const pickupPoints: PickupPoint[] = [
  { id: "pp-accra", name: "Accra Central Pickup Point", region: "Greater Accra", hours: "Mon–Sat, 8am–6pm", otpSecured: true },
  { id: "pp-kumasi", name: "Kumasi Pickup Point", region: "Ashanti", hours: "Mon–Sat, 8am–6pm", otpSecured: true },
  { id: "pp-sunyani", name: "Sunyani Pickup Point", region: "Bono", hours: "Mon–Sat, 8am–6pm", otpSecured: true },
  { id: "pp-hwidiem", name: "Hwidiem / Ahafo Pickup Point", region: "Ahafo", hours: "Mon–Sat, 8am–6pm", otpSecured: true },
  { id: "pp-ucc", name: "UCC Campus Pickup Point", region: "Central", hours: "Mon–Fri, 9am–5pm", otpSecured: true },
  { id: "pp-knust", name: "KNUST Campus Pickup Point", region: "Ashanti", hours: "Mon–Fri, 9am–5pm", otpSecured: true },
  { id: "pp-ug", name: "University of Ghana Pickup Point", region: "Greater Accra", hours: "Mon–Fri, 9am–5pm", otpSecured: true },
  { id: "pp-ntc", name: "Nursing Training College Pickup Point", region: "Bono", hours: "Mon–Fri, 9am–5pm", otpSecured: true },
  { id: "pp-ttc", name: "Teacher Training College Pickup Point", region: "Bono", hours: "Mon–Fri, 9am–5pm", otpSecured: true },
];

export interface LandedCost {
  productPrice: number;
  foreignDelivery: number;
  internationalFreight: number;
  customs: number;
  pickupFee: number;
  serviceFee: number;
  total: number;
}

/** Estimates a full landed cost (in GH₵) from a product price. Illustrative only. */
export function computeLandedCost(productPrice: number): LandedCost {
  const price = Math.max(0, Math.round(productPrice) || 0);
  const foreignDelivery = Math.round(price * 0.05) + 20;
  const internationalFreight = Math.round(price * 0.08) + 60;
  const customs = Math.round(price * 0.1);
  const pickupFee = 25;
  const serviceFee = Math.round(price * 0.05) + 15;
  const total = price + foreignDelivery + internationalFreight + customs + pickupFee + serviceFee;
  return { productPrice: price, foreignDelivery, internationalFreight, customs, pickupFee, serviceFee, total };
}

export const LANDED_COST_LABELS: { key: keyof Omit<LandedCost, "total">; label: string }[] = [
  { key: "productPrice", label: "Product price" },
  { key: "foreignDelivery", label: "Foreign local delivery" },
  { key: "internationalFreight", label: "International freight" },
  { key: "customs", label: "Customs estimate" },
  { key: "pickupFee", label: "Ghana pickup fee" },
  { key: "serviceFee", label: "NikiMart service fee" },
];

export type OrderStatus =
  | "processing"
  | "purchased"
  | "in_transit_to_ghana"
  | "customs_clearance"
  | "ready_for_pickup"
  | "completed"
  | "disputed";

export interface OrderStage {
  key: OrderStatus;
  label: string;
  description: string;
}

// The happy-path timeline a global order moves through, in order.
export const ORDER_STAGES: OrderStage[] = [
  { key: "processing", label: "Order placed & paid", description: "We received your order and payment is confirmed." },
  { key: "purchased", label: "Purchased from seller", description: "We bought your item from the seller." },
  { key: "in_transit_to_ghana", label: "In transit to Ghana", description: "Your item is on its way via international freight." },
  { key: "customs_clearance", label: "Customs clearance", description: "Your item is clearing customs in Ghana." },
  { key: "ready_for_pickup", label: "Ready for pickup", description: "Your item has arrived and is ready to collect." },
  { key: "completed", label: "Collected", description: "Your order is complete. Enjoy!" },
];

export function stageIndex(status: OrderStatus): number {
  const i = ORDER_STAGES.findIndex((s) => s.key === status);
  return i === -1 ? 0 : i;
}

export interface DemoOrder {
  orderNumber: string;
  status: OrderStatus;
  item: string;
  source: string;
  pickupPointId: string;
  pickupOtp: string;
  placedOn: string;
  cost: LandedCost;
}

export const demoOrders: DemoOrder[] = [
  {
    orderNumber: "NM-10001",
    status: "ready_for_pickup",
    item: "Lenovo ThinkPad Student Laptop",
    source: "USA",
    pickupPointId: "pp-accra",
    pickupOtp: "482913",
    placedOn: "2026-06-02",
    cost: computeLandedCost(4200),
  },
  {
    orderNumber: "NM-10002",
    status: "in_transit_to_ghana",
    item: "Shenzhen Bluetooth Earbuds (x5)",
    source: "China",
    pickupPointId: "pp-knust",
    pickupOtp: "739120",
    placedOn: "2026-06-18",
    cost: computeLandedCost(1100),
  },
  {
    orderNumber: "NM-10003",
    status: "customs_clearance",
    item: "Dubai Gold-Tone Watch",
    source: "Dubai / UAE",
    pickupPointId: "pp-kumasi",
    pickupOtp: "663201",
    placedOn: "2026-06-10",
    cost: computeLandedCost(6240),
  },
  {
    orderNumber: "NM-10004",
    status: "completed",
    item: "Campus Backpack",
    source: "Ghana",
    pickupPointId: "pp-ug",
    pickupOtp: "112490",
    placedOn: "2026-05-21",
    cost: computeLandedCost(780),
  },
];

export function getOrderByNumber(orderNumber: string): DemoOrder | undefined {
  return demoOrders.find((o) => o.orderNumber.toLowerCase() === orderNumber.toLowerCase());
}

export function getPickupPointById(id: string): PickupPoint | undefined {
  return pickupPoints.find((p) => p.id === id);
}
