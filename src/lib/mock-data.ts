import type {
  Category,
  Location,
  PreorderInfo,
  Product,
  ServiceInfo,
  Vendor,
} from "./types";

export const locations: Location[] = [
  { id: "any", name: "Any Location", type: "city", region: "Nationwide", isActive: true },
  { id: "ug", name: "University of Ghana", type: "campus", region: "Greater Accra", isActive: true },
  { id: "knust", name: "KNUST", type: "campus", region: "Ashanti", isActive: true },
  { id: "ucc", name: "UCC", type: "campus", region: "Central", isActive: true },
  { id: "upsa", name: "UPSA", type: "campus", region: "Greater Accra", isActive: true },
  { id: "stu", name: "Sunyani Technical University", type: "campus", region: "Bono", isActive: true },
  { id: "ntc", name: "Nursing Training College", type: "institution", region: "Bono", isActive: true },
  { id: "ttc", name: "Teacher Training College", type: "institution", region: "Bono", isActive: true },
  { id: "st-elizabeth", name: "St. Elizabeth Hospital Community", type: "community", region: "Ahafo", isActive: true },
  { id: "hwidiem", name: "Hwidiem", type: "town", region: "Ahafo", isActive: true },
  { id: "goaso", name: "Goaso", type: "town", region: "Ahafo", isActive: true },
  { id: "sunyani", name: "Sunyani", type: "city", region: "Bono", isActive: true },
  { id: "kumasi", name: "Kumasi", type: "city", region: "Ashanti", isActive: true },
  { id: "accra", name: "Accra", type: "city", region: "Greater Accra", isActive: true },
];

export const categories: Category[] = [
  { id: "cat-phones", name: "Phones & Tablets", slug: "phones-tablets", icon: "smartphone", description: "Smartphones, tablets and accessories", productCount: 482 },
  { id: "cat-phone-accessories", name: "Phone Accessories", slug: "phone-accessories", icon: "headphones", description: "Cases, chargers, earbuds and more", productCount: 311 },
  { id: "cat-fashion", name: "Fashion", slug: "fashion", icon: "shirt", description: "Clothing for men, women and kids", productCount: 624 },
  { id: "cat-shoes-bags", name: "Shoes & Bags", slug: "shoes-bags", icon: "footprints", description: "Footwear and bags for every style", productCount: 298 },
  { id: "cat-beauty", name: "Beauty & Cosmetics", slug: "beauty-cosmetics", icon: "sparkles", description: "Skincare, makeup and fragrances", productCount: 356 },
  { id: "cat-groceries", name: "Groceries & Provisions", slug: "groceries-provisions", icon: "shopping-basket", description: "Everyday household provisions", productCount: 410 },
  { id: "cat-food-drinks", name: "Food & Drinks", slug: "food-drinks", icon: "utensils", description: "Meals, snacks and beverages", productCount: 187 },
  { id: "cat-electronics", name: "Electronics", slug: "electronics", icon: "laptop", description: "Gadgets, computers and appliances", productCount: 264 },
  { id: "cat-hostel", name: "Home & Hostel Essentials", slug: "home-hostel-essentials", icon: "lamp", description: "Everything for your room and home", productCount: 233 },
  { id: "cat-school", name: "School & Office Supplies", slug: "school-office-supplies", icon: "pencil-ruler", description: "Stationery, bags and supplies", productCount: 178 },
  { id: "cat-health", name: "Health & Personal Care", slug: "health-personal-care", icon: "heart-pulse", description: "Wellness and personal care essentials", productCount: 142 },
  { id: "cat-baby-kids", name: "Baby & Kids", slug: "baby-kids", icon: "baby", description: "Everything for babies and children", productCount: 96 },
  { id: "cat-services", name: "Services", slug: "services", icon: "concierge-bell", description: "Trusted local service providers", productCount: 88 },
  { id: "cat-preorder", name: "Preorder Deals", slug: "preorder-deals", icon: "package-2", description: "Imported and upcoming products", productCount: 64 },
  { id: "cat-official", name: "NikiMart Official Store", slug: "nikimart-official-store", icon: "badge-check", description: "Verified NikiMart branded products", productCount: 41 },
];

const fmtVendorAccent = (from: string, to: string) => ({ accentFrom: from, accentTo: to });

export const vendors: Vendor[] = [
  {
    id: "vendor-campusgadgets",
    slug: "campus-gadgets-hub",
    businessName: "Campus Gadgets Hub",
    sellerTypes: ["campus_vendor", "local_shop"],
    description: "Your go-to spot for phones, accessories and gadget repairs right on campus.",
    initials: "CG",
    ...fmtVendorAccent("#FF8A00", "#FFC107"),
    locationIds: ["ug", "accra"],
    originCountry: "GH",
    verificationStatus: "verified",
    rating: 4.8,
    reviewCount: 312,
    totalSales: 5400,
    isOfficial: false,
    deliveryAvailable: true,
    pickupAvailable: true,
    sameDayDeliveryAvailable: true,
  },
  {
    id: "vendor-nikimart-official",
    slug: "nikimart-official-store",
    businessName: "NikiMart Official Store",
    sellerTypes: ["official_partner"],
    description: "Verified NikiMart branded gear, merch, and trusted bulk-sourced essentials.",
    initials: "NM",
    ...fmtVendorAccent("#07111F", "#FF8A00"),
    locationIds: ["any"],
    originCountry: "GH",
    verificationStatus: "verified",
    rating: 4.9,
    reviewCount: 1204,
    totalSales: 18700,
    isOfficial: true,
    deliveryAvailable: true,
    pickupAvailable: true,
    sameDayDeliveryAvailable: true,
  },
  {
    id: "vendor-importedstyles",
    slug: "imported-styles-gh",
    businessName: "Imported Styles GH",
    sellerTypes: ["preorder_seller", "wholesale_supplier"],
    description: "Preorder the latest fashion and sneakers imported directly from trusted suppliers.",
    initials: "IS",
    ...fmtVendorAccent("#122A47", "#FF8A00"),
    locationIds: ["kumasi", "accra", "knust"],
    originCountry: "CN",
    verificationStatus: "verified",
    rating: 4.6,
    reviewCount: 198,
    totalSales: 2300,
    isOfficial: false,
    deliveryAvailable: true,
    pickupAvailable: false,
    sameDayDeliveryAvailable: false,
  },
  {
    id: "vendor-mamaadwoa",
    slug: "mama-adwoa-kitchen",
    businessName: "Mama Adwoa's Kitchen",
    sellerTypes: ["food_vendor", "local_shop"],
    description: "Home-style Ghanaian meals delivered hot and fresh to your hostel or office.",
    initials: "MA",
    ...fmtVendorAccent("#10B981", "#FFC107"),
    locationIds: ["knust", "kumasi"],
    originCountry: "GH",
    verificationStatus: "verified",
    rating: 4.7,
    reviewCount: 540,
    totalSales: 9100,
    isOfficial: false,
    deliveryAvailable: true,
    pickupAvailable: true,
    sameDayDeliveryAvailable: true,
  },
  {
    id: "vendor-quickfix",
    slug: "quickfix-services",
    businessName: "QuickFix Services",
    sellerTypes: ["service_provider", "campus_vendor"],
    description: "Phone repairs, laundry, printing and typing services for busy students.",
    initials: "QF",
    ...fmtVendorAccent("#0E1F36", "#10B981"),
    locationIds: ["ug", "upsa", "accra"],
    originCountry: "GH",
    verificationStatus: "verified",
    rating: 4.5,
    reviewCount: 267,
    totalSales: 3600,
    isOfficial: false,
    deliveryAvailable: false,
    pickupAvailable: true,
    sameDayDeliveryAvailable: true,
  },
  {
    id: "vendor-sunyanigeneral",
    slug: "sunyani-general-stores",
    businessName: "Sunyani General Stores",
    sellerTypes: ["local_shop", "wholesale_supplier"],
    description: "Wholesale groceries and household provisions serving the Bono region.",
    initials: "SG",
    ...fmtVendorAccent("#FF8A00", "#EF4444"),
    locationIds: ["sunyani", "hwidiem", "goaso", "stu"],
    originCountry: "GH",
    verificationStatus: "verified",
    rating: 4.4,
    reviewCount: 154,
    totalSales: 2800,
    isOfficial: false,
    deliveryAvailable: true,
    pickupAvailable: true,
    sameDayDeliveryAvailable: false,
  },
  {
    id: "vendor-glamhouse",
    slug: "glam-house-beauty",
    businessName: "Glam House Beauty",
    sellerTypes: ["local_shop"],
    description: "Curated skincare, makeup and fragrances for every budget.",
    initials: "GH",
    ...fmtVendorAccent("#FFC107", "#EF4444"),
    locationIds: ["accra", "ucc"],
    originCountry: "GH",
    verificationStatus: "pending",
    rating: 4.3,
    reviewCount: 88,
    totalSales: 940,
    isOfficial: false,
    deliveryAvailable: true,
    pickupAvailable: false,
    sameDayDeliveryAvailable: false,
  },
];

const preorder = (overrides: Partial<PreorderInfo>): PreorderInfo => ({
  estimatedArrival: "3-4 weeks",
  closingDate: "2026-07-10",
  depositRequired: true,
  depositType: "percentage",
  depositValue: 30,
  balanceInstruction: "Pay the remaining balance on arrival before delivery or pickup.",
  refundPolicy: "Full deposit refund if the order is cancelled before the closing date.",
  sourceLocation: "Dubai, UAE",
  preorderStatus: "open",
  ...overrides,
});

const service = (overrides: Partial<ServiceInfo>): ServiceInfo => ({
  serviceArea: "On campus & nearby community",
  availability: "Mon - Sat, 8am - 7pm",
  priceType: "range",
  minPrice: 20,
  maxPrice: 80,
  bookingNotes: "Please book at least 2 hours in advance.",
  ...overrides,
});

export const products: Product[] = [
  // In-stock products
  {
    id: "prod-iphone13", slug: "iphone-13-128gb", name: "iPhone 13 128GB (UK Used)",
    categoryId: "cat-phones", vendorId: "vendor-campusgadgets",
    description: "Clean UK-used iPhone 13 with 128GB storage, 90% battery health, and a free tempered glass.",
    price: 3899, oldPrice: 4399, stockQuantity: 6, productType: "in_stock",
    badges: ["in_stock", "verified_seller", "campus_delivery", "same_day_delivery"],
    locationIds: ["ug", "accra"], campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: true, rating: 4.8, reviewCount: 64,
    gradientFrom: "#0e1f36", gradientTo: "#07111f", emoji: "📱",
  },
  {
    id: "prod-earbuds", slug: "wireless-earbuds-pro", name: "NikiSound Wireless Earbuds Pro",
    categoryId: "cat-phone-accessories", vendorId: "vendor-nikimart-official",
    description: "Official NikiMart wireless earbuds with active noise cancellation and 30-hour battery life.",
    price: 249, oldPrice: 349, stockQuantity: 40, productType: "in_stock",
    badges: ["in_stock", "official", "flash_sale", "top_rated"],
    locationIds: ["any"], campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: true, isFeatured: true, rating: 4.9, reviewCount: 421,
    gradientFrom: "#07111f", gradientTo: "#ff8a00", emoji: "🎧",
  },
  {
    id: "prod-powerbank", slug: "20000mah-power-bank", name: "20000mAh Fast Charge Power Bank",
    categoryId: "cat-phone-accessories", vendorId: "vendor-campusgadgets",
    description: "Stay powered all day with fast 22.5W charging and dual USB output.",
    price: 189, stockQuantity: 25, productType: "in_stock",
    badges: ["in_stock", "campus_delivery", "limited_stock"],
    locationIds: ["ug", "accra"], campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.6, reviewCount: 53,
    gradientFrom: "#122a47", gradientTo: "#0e1f36", emoji: "🔌",
  },
  {
    id: "prod-ankarafit", slug: "ankara-print-fitted-dress", name: "Ankara Print Fitted Dress",
    categoryId: "cat-fashion", vendorId: "vendor-glamhouse",
    description: "Bold ankara print fitted dress, tailored for a flattering fit. Available in multiple sizes.",
    price: 145, oldPrice: 199, stockQuantity: 18, productType: "in_stock",
    badges: ["in_stock", "flash_sale"], locationIds: ["accra", "ucc"],
    campusDeliveryAvailable: false, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.5, reviewCount: 37,
    gradientFrom: "#ffc107", gradientTo: "#ef4444", emoji: "👗",
  },
  {
    id: "prod-sneakers", slug: "classic-court-sneakers", name: "Classic Court Sneakers",
    categoryId: "cat-shoes-bags", vendorId: "vendor-importedstyles",
    description: "Comfortable everyday sneakers with breathable mesh lining and durable rubber sole.",
    price: 280, stockQuantity: 30, productType: "in_stock",
    badges: ["in_stock", "top_rated"], locationIds: ["kumasi", "accra"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: true, rating: 4.7, reviewCount: 112,
    gradientFrom: "#0e1f36", gradientTo: "#ff8a00", emoji: "👟",
  },
  {
    id: "prod-totebag", slug: "canvas-tote-bag", name: "Canvas Tote Bag",
    categoryId: "cat-shoes-bags", vendorId: "vendor-glamhouse",
    description: "Spacious canvas tote bag, perfect for lectures, errands or the market.",
    price: 65, stockQuantity: 50, productType: "in_stock",
    badges: ["in_stock"], locationIds: ["accra"],
    campusDeliveryAvailable: false, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.2, reviewCount: 19,
    gradientFrom: "#ff8a00", gradientTo: "#ffc107", emoji: "👜",
  },
  {
    id: "prod-skincare", slug: "glow-skincare-bundle", name: "Glow Skincare Starter Bundle",
    categoryId: "cat-beauty", vendorId: "vendor-glamhouse",
    description: "Cleanser, toner and moisturizer bundle for radiant, healthy-looking skin.",
    price: 175, oldPrice: 220, stockQuantity: 22, productType: "in_stock",
    badges: ["in_stock", "flash_sale", "top_rated"], locationIds: ["accra", "ucc"],
    campusDeliveryAvailable: false, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: true, rating: 4.8, reviewCount: 96,
    gradientFrom: "#ef4444", gradientTo: "#ffc107", emoji: "✨",
  },
  {
    id: "prod-perfume", slug: "signature-eau-de-parfum", name: "Signature Eau De Parfum 50ml",
    categoryId: "cat-beauty", vendorId: "vendor-importedstyles",
    description: "Long-lasting signature fragrance imported directly from trusted international suppliers.",
    price: 220, stockQuantity: 15, productType: "in_stock",
    badges: ["in_stock", "imported_item"], locationIds: ["kumasi", "knust"],
    campusDeliveryAvailable: true, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.6, reviewCount: 41,
    gradientFrom: "#122a47", gradientTo: "#ef4444", emoji: "🧴",
  },
  {
    id: "prod-ricebag", slug: "premium-rice-25kg", name: "Premium Long Grain Rice 25kg",
    categoryId: "cat-groceries", vendorId: "vendor-sunyanigeneral",
    description: "Bulk 25kg bag of premium long grain rice, perfect for hostels and families.",
    price: 410, stockQuantity: 60, productType: "in_stock",
    badges: ["in_stock", "campus_delivery"], locationIds: ["sunyani", "stu", "hwidiem", "goaso"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.7, reviewCount: 73,
    gradientFrom: "#ff8a00", gradientTo: "#10b981", emoji: "🌾",
  },
  {
    id: "prod-cookingoil", slug: "vegetable-cooking-oil-5l", name: "Vegetable Cooking Oil 5L",
    categoryId: "cat-groceries", vendorId: "vendor-sunyanigeneral",
    description: "Pure vegetable cooking oil, 5 litre bottle, great for home and small business use.",
    price: 145, stockQuantity: 45, productType: "in_stock",
    badges: ["in_stock", "limited_stock"], locationIds: ["sunyani", "goaso"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.4, reviewCount: 28,
    gradientFrom: "#10b981", gradientTo: "#ffc107", emoji: "🛢️",
  },
  {
    id: "prod-laptop", slug: "core-i5-business-laptop", name: "Core i5 Business Laptop (Refurbished)",
    categoryId: "cat-electronics", vendorId: "vendor-campusgadgets",
    description: "Reliable refurbished business laptop, 8GB RAM, 256GB SSD — great for school work.",
    price: 2650, oldPrice: 3100, stockQuantity: 8, productType: "in_stock",
    badges: ["in_stock", "verified_seller", "flash_sale"], locationIds: ["ug", "accra"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: true, rating: 4.7, reviewCount: 88,
    gradientFrom: "#0e1f36", gradientTo: "#122a47", emoji: "💻",
  },
  {
    id: "prod-blender", slug: "compact-electric-blender", name: "Compact Electric Blender",
    categoryId: "cat-electronics", vendorId: "vendor-nikimart-official",
    description: "Official NikiMart compact blender, perfect for smoothies and small hostel kitchens.",
    price: 195, stockQuantity: 33, productType: "in_stock",
    badges: ["in_stock", "official"], locationIds: ["any"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: true, isFeatured: false, rating: 4.6, reviewCount: 59,
    gradientFrom: "#07111f", gradientTo: "#ffc107", emoji: "🧃",
  },
  {
    id: "prod-bedsheet", slug: "hostel-bedding-set", name: "4-Piece Hostel Bedding Set",
    categoryId: "cat-hostel", vendorId: "vendor-sunyanigeneral",
    description: "Soft and durable 4-piece bedding set sized perfectly for hostel beds.",
    price: 220, stockQuantity: 27, productType: "in_stock",
    badges: ["in_stock", "campus_delivery"], locationIds: ["stu", "sunyani"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.5, reviewCount: 34,
    gradientFrom: "#ff8a00", gradientTo: "#122a47", emoji: "🛏️",
  },
  {
    id: "prod-readinglamp", slug: "rechargeable-reading-lamp", name: "Rechargeable LED Reading Lamp",
    categoryId: "cat-hostel", vendorId: "vendor-campusgadgets",
    description: "Bright, rechargeable LED lamp with 3 brightness modes — perfect for late night study.",
    price: 85, stockQuantity: 70, productType: "in_stock",
    badges: ["in_stock", "campus_delivery", "same_day_delivery"], locationIds: ["ug", "knust"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: false, rating: 4.4, reviewCount: 46,
    gradientFrom: "#ffc107", gradientTo: "#07111f", emoji: "💡",
  },
  {
    id: "prod-notebookset", slug: "a5-notebook-set", name: "A5 Notebook Set (Pack of 5)",
    categoryId: "cat-school", vendorId: "vendor-sunyanigeneral",
    description: "Durable A5 notebooks, pack of 5, ideal for lectures and note-taking.",
    price: 48, stockQuantity: 100, productType: "in_stock",
    badges: ["in_stock"], locationIds: ["sunyani", "stu", "ttc"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.3, reviewCount: 22,
    gradientFrom: "#10b981", gradientTo: "#0e1f36", emoji: "📓",
  },
  {
    id: "prod-vitaminc", slug: "vitamin-c-immune-boost", name: "Vitamin C Immune Boost Tablets",
    categoryId: "cat-health", vendorId: "vendor-nikimart-official",
    description: "Daily Vitamin C tablets to support a healthy immune system, 60-count bottle.",
    price: 95, stockQuantity: 80, productType: "in_stock",
    badges: ["in_stock", "official", "top_rated"], locationIds: ["any"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: true, isFeatured: false, rating: 4.8, reviewCount: 134,
    gradientFrom: "#10b981", gradientTo: "#ffc107", emoji: "💊",
  },
  {
    id: "prod-babywipes", slug: "gentle-baby-wipes-pack", name: "Gentle Baby Wipes (6-Pack)",
    categoryId: "cat-baby-kids", vendorId: "vendor-sunyanigeneral",
    description: "Alcohol-free gentle baby wipes, bulk 6-pack for everyday use.",
    price: 110, stockQuantity: 38, productType: "in_stock",
    badges: ["in_stock"], locationIds: ["sunyani", "kumasi"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.6, reviewCount: 29,
    gradientFrom: "#ffc107", gradientTo: "#10b981", emoji: "🧸",
  },
  {
    id: "prod-hoodie", slug: "nikimart-campus-hoodie", name: "NikiMart Campus Hoodie",
    categoryId: "cat-official", vendorId: "vendor-nikimart-official",
    description: "Official NikiMart branded hoodie — soft fleece, unisex fit, available in 4 colours.",
    price: 165, stockQuantity: 55, productType: "in_stock",
    badges: ["in_stock", "official", "top_rated"], locationIds: ["any"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: true, isFeatured: true, rating: 4.9, reviewCount: 201,
    gradientFrom: "#07111f", gradientTo: "#ff8a00", emoji: "👕",
  },
  {
    id: "prod-totewatch", slug: "nikimart-classic-watch", name: "NikiMart Classic Watch",
    categoryId: "cat-official", vendorId: "vendor-nikimart-official",
    description: "Minimalist official NikiMart watch with leather strap and 1-year warranty.",
    price: 320, oldPrice: 399, stockQuantity: 20, productType: "in_stock",
    badges: ["in_stock", "official", "flash_sale"], locationIds: ["any"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: true, isFeatured: true, rating: 4.7, reviewCount: 77,
    gradientFrom: "#122a47", gradientTo: "#ffc107", emoji: "⌚",
  },
  {
    id: "prod-flashdrive", slug: "64gb-usb-flash-drive", name: "64GB USB 3.0 Flash Drive",
    categoryId: "cat-school", vendorId: "vendor-campusgadgets",
    description: "Fast, reliable 64GB flash drive for assignments, projects and backups.",
    price: 60, stockQuantity: 90, productType: "in_stock",
    badges: ["in_stock", "limited_stock"], locationIds: ["ug", "accra"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: false, rating: 4.5, reviewCount: 31,
    gradientFrom: "#0e1f36", gradientTo: "#10b981", emoji: "🔑",
  },

  // Preorder products
  {
    id: "prod-iphone15promax", slug: "iphone-15-pro-max-preorder", name: "iPhone 15 Pro Max 256GB (Preorder)",
    categoryId: "cat-phones", vendorId: "vendor-importedstyles",
    description: "Brand new iPhone 15 Pro Max, factory sealed, imported on order from Dubai.",
    price: 9800, stockQuantity: 0, productType: "preorder",
    badges: ["preorder", "deposit_required", "imported_item"], locationIds: ["accra", "kumasi"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: true, rating: 4.9, reviewCount: 22,
    gradientFrom: "#07111f", gradientTo: "#122a47", emoji: "📱",
    preorderInfo: preorder({ estimatedArrival: "4-5 weeks", depositValue: 40, sourceLocation: "Dubai, UAE", preorderStatus: "open" }),
  },
  {
    id: "prod-ps5", slug: "playstation-5-slim-preorder", name: "PlayStation 5 Slim (Preorder)",
    categoryId: "cat-electronics", vendorId: "vendor-importedstyles",
    description: "Next-gen PlayStation 5 Slim console, imported on preorder with 1 controller included.",
    price: 6200, stockQuantity: 0, productType: "preorder",
    badges: ["preorder", "deposit_required", "imported_item", "limited_stock"], locationIds: ["accra", "knust"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: true, rating: 4.8, reviewCount: 16,
    gradientFrom: "#122a47", gradientTo: "#07111f", emoji: "🎮",
    preorderInfo: preorder({ estimatedArrival: "5-6 weeks", depositValue: 50, minimumOrders: 5, preorderStatus: "closing_soon" }),
  },
  {
    id: "prod-airjordans", slug: "imported-air-sneakers-preorder", name: "Imported Air Sneakers (Preorder)",
    categoryId: "cat-shoes-bags", vendorId: "vendor-importedstyles",
    description: "Trending imported sneakers, preorder now and receive in 3-4 weeks.",
    price: 950, stockQuantity: 0, productType: "preorder",
    badges: ["preorder", "deposit_required", "imported_item"], locationIds: ["kumasi", "accra"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.6, reviewCount: 12,
    gradientFrom: "#ff8a00", gradientTo: "#07111f", emoji: "👟",
    preorderInfo: preorder({ depositValue: 30, preorderStatus: "open" }),
  },
  {
    id: "prod-designerbag", slug: "designer-handbag-preorder", name: "Designer Handbag (Preorder)",
    categoryId: "cat-shoes-bags", vendorId: "vendor-importedstyles",
    description: "Premium designer-inspired handbag, imported to order from trusted overseas suppliers.",
    price: 680, stockQuantity: 0, productType: "preorder",
    badges: ["preorder", "deposit_required", "imported_item"], locationIds: ["accra"],
    campusDeliveryAvailable: false, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.5, reviewCount: 9,
    gradientFrom: "#ef4444", gradientTo: "#ffc107", emoji: "👜",
    preorderInfo: preorder({ depositValue: 35, preorderStatus: "open" }),
  },
  {
    id: "prod-smartwatch", slug: "smartwatch-series-preorder", name: "Smartwatch Series X (Preorder)",
    categoryId: "cat-phone-accessories", vendorId: "vendor-importedstyles",
    description: "Latest generation smartwatch with health tracking, imported on preorder.",
    price: 1450, stockQuantity: 0, productType: "preorder",
    badges: ["preorder", "deposit_required", "imported_item"], locationIds: ["accra", "kumasi", "knust"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: true, rating: 4.7, reviewCount: 14,
    gradientFrom: "#0e1f36", gradientTo: "#ffc107", emoji: "⌚",
    preorderInfo: preorder({ depositValue: 30, preorderStatus: "open" }),
  },
  {
    id: "prod-gamingchair", slug: "ergonomic-gaming-chair-preorder", name: "Ergonomic Gaming Chair (Preorder)",
    categoryId: "cat-electronics", vendorId: "vendor-importedstyles",
    description: "Comfortable ergonomic gaming chair, preorder now ahead of next shipment.",
    price: 1850, stockQuantity: 0, productType: "preorder",
    badges: ["preorder", "deposit_required", "imported_item"], locationIds: ["accra"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.4, reviewCount: 7,
    gradientFrom: "#122a47", gradientTo: "#10b981", emoji: "🪑",
    preorderInfo: preorder({ estimatedArrival: "6-7 weeks", depositValue: 40, preorderStatus: "open" }),
  },

  // Service listings
  {
    id: "prod-laundry", slug: "campus-laundry-service", name: "Campus Laundry & Ironing Service",
    categoryId: "cat-services", vendorId: "vendor-quickfix",
    description: "Wash, dry and iron service with same-day turnaround for campus residents.",
    price: 25, stockQuantity: 0, productType: "service",
    badges: ["service", "campus_delivery", "top_rated"], locationIds: ["ug", "upsa"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: true, rating: 4.8, reviewCount: 203,
    gradientFrom: "#10b981", gradientTo: "#0e1f36", emoji: "🧺",
    serviceInfo: service({ priceType: "fixed", minPrice: 25, maxPrice: 25, bookingNotes: "Drop-off by 10am for same-day pickup." }),
  },
  {
    id: "prod-printing", slug: "printing-and-binding-service", name: "Printing & Binding Service",
    categoryId: "cat-services", vendorId: "vendor-quickfix",
    description: "Fast, affordable printing, photocopying and project binding services.",
    price: 1, stockQuantity: 0, productType: "service",
    badges: ["service", "same_day_delivery"], locationIds: ["ug", "accra"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: false, rating: 4.6, reviewCount: 156,
    gradientFrom: "#0e1f36", gradientTo: "#ff8a00", emoji: "🖨️",
    serviceInfo: service({ priceType: "range", minPrice: 1, maxPrice: 50, bookingNotes: "Price per page; binding priced separately." }),
  },
  {
    id: "prod-phonerepair", slug: "phone-screen-repair-service", name: "Phone Screen Repair Service",
    categoryId: "cat-services", vendorId: "vendor-quickfix",
    description: "Professional screen and battery replacement for most smartphone brands.",
    price: 150, stockQuantity: 0, productType: "service",
    badges: ["service", "verified_seller", "top_rated"], locationIds: ["ug", "accra", "upsa"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: true, rating: 4.7, reviewCount: 189,
    gradientFrom: "#ff8a00", gradientTo: "#122a47", emoji: "🛠️",
    serviceInfo: service({ priceType: "range", minPrice: 150, maxPrice: 600, bookingNotes: "Repair time 30 mins - 2 hours depending on damage." }),
  },
  {
    id: "prod-graphicdesign", slug: "graphic-design-service", name: "Graphic Design & Branding Service",
    categoryId: "cat-services", vendorId: "vendor-quickfix",
    description: "Logos, flyers, social media graphics and branding kits designed to order.",
    price: 80, stockQuantity: 0, productType: "service",
    badges: ["service"], locationIds: ["accra", "ug"],
    campusDeliveryAvailable: false, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.9, reviewCount: 64,
    gradientFrom: "#122a47", gradientTo: "#ffc107", emoji: "🎨",
    serviceInfo: service({ priceType: "range", minPrice: 80, maxPrice: 400, bookingNotes: "Turnaround typically 24-72 hours." }),
  },
  {
    id: "prod-makeup", slug: "event-makeup-service", name: "Event & Bridal Makeup Service",
    categoryId: "cat-services", vendorId: "vendor-glamhouse",
    description: "Professional makeup application for graduations, weddings and special events.",
    price: 200, stockQuantity: 0, productType: "service",
    badges: ["service", "top_rated"], locationIds: ["accra", "ucc"],
    campusDeliveryAvailable: false, pickupAvailable: false, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: true, rating: 4.8, reviewCount: 91,
    gradientFrom: "#ef4444", gradientTo: "#ff8a00", emoji: "💄",
    serviceInfo: service({ priceType: "range", minPrice: 200, maxPrice: 600, bookingNotes: "Book at least 3 days in advance for events." }),
  },
  {
    id: "prod-cleaning", slug: "hostel-cleaning-service", name: "Hostel Room Cleaning Service",
    categoryId: "cat-services", vendorId: "vendor-quickfix",
    description: "Thorough room cleaning service for busy students — deep clean or quick tidy options.",
    price: 60, stockQuantity: 0, productType: "service",
    badges: ["service", "campus_delivery"], locationIds: ["ug", "knust"],
    campusDeliveryAvailable: true, pickupAvailable: false, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: false, rating: 4.5, reviewCount: 47,
    gradientFrom: "#10b981", gradientTo: "#ffc107", emoji: "🧹",
    serviceInfo: service({ priceType: "range", minPrice: 60, maxPrice: 150, bookingNotes: "Same-day booking subject to availability." }),
  },

  // Food listings
  {
    id: "prod-jollof", slug: "special-jollof-rice-combo", name: "Special Jollof Rice Combo",
    categoryId: "cat-food-drinks", vendorId: "vendor-mamaadwoa",
    description: "Smoky jollof rice with grilled chicken, coleslaw and a side of plantain.",
    price: 35, stockQuantity: 0, productType: "food",
    badges: ["food_vendor", "campus_delivery", "top_rated"], locationIds: ["knust", "kumasi"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: true, rating: 4.9, reviewCount: 312,
    gradientFrom: "#ff8a00", gradientTo: "#ef4444", emoji: "🍛",
  },
  {
    id: "prod-waakye", slug: "waakye-special", name: "Waakye Special with Fish",
    categoryId: "cat-food-drinks", vendorId: "vendor-mamaadwoa",
    description: "Traditional waakye served with fried fish, gari, and shito.",
    price: 30, stockQuantity: 0, productType: "food",
    badges: ["food_vendor", "campus_delivery"], locationIds: ["knust"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: false, rating: 4.7, reviewCount: 178,
    gradientFrom: "#10b981", gradientTo: "#ff8a00", emoji: "🍚",
  },
  {
    id: "prod-friedrice", slug: "fried-rice-chicken-combo", name: "Fried Rice & Chicken Combo",
    categoryId: "cat-food-drinks", vendorId: "vendor-mamaadwoa",
    description: "Vegetable fried rice paired with seasoned grilled chicken.",
    price: 38, stockQuantity: 0, productType: "food",
    badges: ["food_vendor", "same_day_delivery"], locationIds: ["kumasi"],
    campusDeliveryAvailable: false, pickupAvailable: true, sameDayDeliveryAvailable: true,
    isOfficial: false, isFeatured: false, rating: 4.6, reviewCount: 94,
    gradientFrom: "#ffc107", gradientTo: "#10b981", emoji: "🍗",
  },
  {
    id: "prod-smoothie", slug: "fresh-fruit-smoothie", name: "Fresh Fruit Smoothie",
    categoryId: "cat-food-drinks", vendorId: "vendor-mamaadwoa",
    description: "Refreshing blend of seasonal fruits, perfect for a quick energy boost.",
    price: 18, stockQuantity: 0, productType: "food",
    badges: ["food_vendor"], locationIds: ["knust", "kumasi"],
    campusDeliveryAvailable: true, pickupAvailable: true, sameDayDeliveryAvailable: false,
    isOfficial: false, isFeatured: false, rating: 4.5, reviewCount: 56,
    gradientFrom: "#10b981", gradientTo: "#ffc107", emoji: "🥤",
  },
];

export const flashSaleProducts = products.filter((p) => p.badges.includes("flash_sale"));
export const preorderProducts = products.filter((p) => p.productType === "preorder");
export const serviceProducts = products.filter((p) => p.productType === "service");
export const foodProducts = products.filter((p) => p.productType === "food");
export const officialProducts = products.filter((p) => p.isOfficial);
export const featuredProducts = products.filter((p) => p.isFeatured);

/**
 * Resolves the image shown on a product card.
 * Priority: an explicit `product.image` (URL or /public path) you set,
 * otherwise the bundled default at /products/<slug>.jpg.
 * To swap a photo: either set `image` on the product below, or drop a new
 * file at public/products/<slug>.jpg (keeping the same name).
 */
export function getProductImage(product: Product): string | undefined {
  // DB-driven: the primary gallery image, else the single image field.
  // No hardcoded /products/<slug>.jpg fallback — a product with no images
  // shows the gradient + emoji placeholder (and its images stay editable).
  return product.images?.[0] ?? product.image;
}

export function getVendorById(id: string): Vendor | undefined {
  return vendors.find((v) => v.id === id);
}

export function getVendorBySlug(slug: string): Vendor | undefined {
  return vendors.find((v) => v.slug === slug);
}

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getCategoryBySlug(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug);
}

export function getProductBySlug(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getProductsByCategoryId(categoryId: string): Product[] {
  return products.filter((p) => p.categoryId === categoryId);
}

export function getProductsByVendorId(vendorId: string): Product[] {
  return products.filter((p) => p.vendorId === vendorId);
}

export function getRelatedProducts(product: Product, limit = 6): Product[] {
  return products
    .filter((p) => p.id !== product.id && p.categoryId === product.categoryId)
    .concat(products.filter((p) => p.id !== product.id && p.categoryId !== product.categoryId))
    .slice(0, limit);
}

export interface ProductFilters {
  q?: string;
  category?: string; // category slug
  badge?: string; // BadgeKind
  type?: string; // ProductType
  maxPrice?: number;
  minPrice?: number;
}

export function filterProducts(filters: ProductFilters): Product[] {
  let result = [...products];
  if (filters.category) {
    const cat = getCategoryBySlug(filters.category);
    if (cat) result = result.filter((p) => p.categoryId === cat.id);
  }
  if (filters.badge) {
    result = result.filter((p) => p.badges.includes(filters.badge as never));
  }
  if (filters.type) {
    result = result.filter((p) => p.productType === filters.type);
  }
  if (typeof filters.maxPrice === "number") {
    result = result.filter((p) => p.price <= filters.maxPrice!);
  }
  if (typeof filters.minPrice === "number") {
    result = result.filter((p) => p.price >= filters.minPrice!);
  }
  if (filters.q) {
    const q = filters.q.toLowerCase().trim();
    result = result.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (getVendorById(p.vendorId)?.businessName.toLowerCase().includes(q) ?? false),
    );
  }
  return result;
}

export function getProductsForLocation(locationId: string): Product[] {
  if (locationId === "any") return products;
  return products.filter((p) => p.locationIds.includes(locationId) || p.locationIds.includes("any"));
}

export function getVendorsForLocation(locationId: string): Vendor[] {
  if (locationId === "any") return vendors;
  return vendors.filter((v) => v.locationIds.includes(locationId) || v.locationIds.includes("any"));
}
