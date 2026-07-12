import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { categories, vendors, products, locations } from "../src/lib/mock-data";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // -------------------------------------------------------------------------
  // Demo users — one per role. Sign in with password123.
  // -------------------------------------------------------------------------
  const demoUsers = [
    { email: "customer@nikimart.test", name: "Ama Mensah", role: "CUSTOMER", phone: "024 000 0001" },
    { email: "seller@nikimart.test", name: "Kojo Owusu", role: "SELLER", phone: "024 000 0002" },
    { email: "admin@nikimart.test", name: "Nana Adjei", role: "ADMIN", phone: "024 000 0003" },
    { email: "freight@nikimart.test", name: "Yaw Boateng", role: "FREIGHT", phone: "024 000 0004" },
    { email: "pickup@nikimart.test", name: "Efua Sarpong", role: "PICKUP", phone: "024 000 0005" },
  ];

  const users: Record<string, { id: string }> = {};
  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, role: u.role, phone: u.phone, passwordHash },
      create: { email: u.email, name: u.name, role: u.role, phone: u.phone, passwordHash },
    });
    users[u.role] = { id: user.id };
  }

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------
  for (const c of categories) {
    await prisma.category.upsert({
      where: { id: c.id },
      update: {
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        description: c.description,
        productCount: c.productCount,
      },
      create: {
        id: c.id,
        name: c.name,
        slug: c.slug,
        icon: c.icon,
        description: c.description,
        productCount: c.productCount,
      },
    });
  }

  // -------------------------------------------------------------------------
  // Locations — same ids as the static list so product/vendor tagging matches.
  // -------------------------------------------------------------------------
  for (const [index, l] of locations.entries()) {
    const locData = { name: l.name, type: l.type, region: l.region, isActive: l.isActive, order: index };
    await prisma.location.upsert({
      where: { id: l.id },
      update: locData,
      create: { id: l.id, ...locData },
    });
  }

  // -------------------------------------------------------------------------
  // Vendors — link the seller demo user to the first vendor as its owner.
  // -------------------------------------------------------------------------
  for (const [index, v] of vendors.entries()) {
    const ownerId = index === 0 ? users.SELLER.id : null;
    const data = {
      slug: v.slug,
      businessName: v.businessName,
      sellerTypes: JSON.stringify(v.sellerTypes),
      description: v.description,
      initials: v.initials,
      accentFrom: v.accentFrom,
      accentTo: v.accentTo,
      locationIds: JSON.stringify(v.locationIds),
      verificationStatus: v.verificationStatus,
      rating: v.rating,
      reviewCount: v.reviewCount,
      totalSales: v.totalSales,
      isOfficial: v.isOfficial,
      deliveryAvailable: v.deliveryAvailable,
      pickupAvailable: v.pickupAvailable,
      sameDayDeliveryAvailable: v.sameDayDeliveryAvailable,
      ownerId,
    };
    await prisma.vendor.upsert({
      where: { id: v.id },
      update: data,
      create: { id: v.id, ...data },
    });
  }

  // -------------------------------------------------------------------------
  // Products
  // -------------------------------------------------------------------------
  for (const p of products) {
    const data = {
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: p.price,
      oldPrice: p.oldPrice ?? null,
      stockQuantity: p.stockQuantity,
      productType: p.productType,
      badges: JSON.stringify(p.badges),
      locationIds: JSON.stringify(p.locationIds),
      campusDeliveryAvailable: p.campusDeliveryAvailable,
      pickupAvailable: p.pickupAvailable,
      sameDayDeliveryAvailable: p.sameDayDeliveryAvailable,
      isOfficial: p.isOfficial,
      isFeatured: p.isFeatured,
      rating: p.rating,
      reviewCount: p.reviewCount,
      gradientFrom: p.gradientFrom,
      gradientTo: p.gradientTo,
      emoji: p.emoji,
      // Give seeded products their bundled photo as an editable primary image.
      image: p.image ?? `/products/${p.slug}.jpg`,
      preorderInfo: p.preorderInfo ? JSON.stringify(p.preorderInfo) : null,
      serviceInfo: p.serviceInfo ? JSON.stringify(p.serviceInfo) : null,
      categoryId: p.categoryId,
      vendorId: p.vendorId,
    };
    await prisma.product.upsert({
      where: { id: p.id },
      update: data,
      create: { id: p.id, ...data },
    });
  }

  // -------------------------------------------------------------------------
  // Pickup points — assign the pickup demo operator to the first one.
  // -------------------------------------------------------------------------
  const pickupPointsData = [
    {
      id: "pp-ug-legon",
      name: "NikiMart Pickup — Legon",
      code: "UG-LEGON",
      locationName: "University of Ghana, Legon",
      address: "Night Market, near the JQB block, Legon Campus",
      operatorId: users.PICKUP.id,
    },
    {
      id: "pp-knust",
      name: "NikiMart Pickup — KNUST",
      code: "KNUST-CENTRAL",
      locationName: "KNUST, Kumasi",
      address: "Commercial Area, opposite the Central Cafeteria",
      operatorId: null,
    },
    {
      id: "pp-sunyani",
      name: "NikiMart Pickup — Sunyani",
      code: "SUNYANI-MAIN",
      locationName: "Sunyani Central",
      address: "Nana Bosoma Market Road, near the STC yard",
      operatorId: null,
    },
  ];
  for (const pp of pickupPointsData) {
    await prisma.pickupPoint.upsert({
      where: { id: pp.id },
      update: {
        name: pp.name,
        code: pp.code,
        locationName: pp.locationName,
        address: pp.address,
        operatorId: pp.operatorId,
      },
      create: pp,
    });
  }

  // -------------------------------------------------------------------------
  // Sample orders for the customer, with items + a shipment for the freight
  // agent, so every dashboard has real data to show.
  // -------------------------------------------------------------------------
  const orderSpecs = [
    {
      id: "order-1001",
      orderNumber: "NM-1001",
      status: "delivered",
      deliveryMethod: "delivery",
      address: "Hall 6, Room 214, Legon Campus, Accra",
      pickupPointId: null,
      items: [
        { productId: "prod-iphone13", quantity: 1 },
        { productId: "prod-earbuds", quantity: 1 },
      ],
      shipment: {
        id: "ship-1001",
        trackingNumber: "NMF-1001",
        status: "delivered",
        origin: "Accra Warehouse",
        destination: "Legon Campus, Accra",
      },
    },
    {
      id: "order-1002",
      orderNumber: "NM-1002",
      status: "shipped",
      deliveryMethod: "pickup",
      address: null,
      pickupPointId: "pp-ug-legon",
      items: [{ productId: "prod-powerbank", quantity: 2 }],
      shipment: {
        id: "ship-1002",
        trackingNumber: "NMF-1002",
        status: "in_transit",
        origin: "Accra Warehouse",
        destination: "NikiMart Pickup — Legon",
      },
    },
    {
      id: "order-1003",
      orderNumber: "NM-1003",
      status: "paid",
      deliveryMethod: "delivery",
      address: "Ahodwo, Kumasi",
      pickupPointId: null,
      items: [{ productId: "prod-skincare", quantity: 1 }],
      shipment: {
        id: "ship-1003",
        trackingNumber: "NMF-1003",
        status: "processing",
        origin: "Kumasi Hub",
        destination: "Ahodwo, Kumasi",
      },
    },
  ];

  const productPriceMap = new Map(products.map((p) => [p.id, p.price]));

  for (const spec of orderSpecs) {
    const items = spec.items.map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      unitPrice: productPriceMap.get(it.productId) ?? 0,
    }));
    const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const deliveryFee = spec.deliveryMethod === "pickup" ? 0 : 20;
    const total = subtotal + deliveryFee;
    const eta = new Date(Date.now() + 1000 * 60 * 60 * 48);

    // Reset the order so re-seeding stays idempotent (items/shipment cascade).
    await prisma.order.deleteMany({ where: { id: spec.id } });
    await prisma.order.create({
      data: {
        id: spec.id,
        orderNumber: spec.orderNumber,
        status: spec.status,
        subtotal,
        deliveryFee,
        total,
        deliveryMethod: spec.deliveryMethod,
        address: spec.address,
        pickupPointId: spec.pickupPointId,
        userId: users.CUSTOMER.id,
        items: { create: items },
        shipment: {
          create: {
            id: spec.shipment.id,
            trackingNumber: spec.shipment.trackingNumber,
            status: spec.shipment.status,
            origin: spec.shipment.origin,
            destination: spec.shipment.destination,
            eta,
            freightAgentId: users.FREIGHT.id,
          },
        },
      },
    });
  }

  // -------------------------------------------------------------------------
  // FAQs (default Help-page entries, editable in the admin).
  // -------------------------------------------------------------------------
  const faqs = [
    { id: "faq-delivery", question: "How does delivery and pickup work?", answer: "Many sellers offer same-day delivery, campus drop-off, or in-person pickup. The available options are shown on each product page and at checkout." },
    { id: "faq-preorder", question: "How do preorders work?", answer: "Preorder items are imported on order. You pay a deposit to reserve your item, then settle the balance on arrival before delivery or pickup. Review each product's arrival estimate and refund policy first." },
    { id: "faq-pay", question: "How do I pay?", answer: "NikiMart supports local payments including Mobile Money and card. You choose your payment method at checkout." },
    { id: "faq-sell", question: "How do I become a seller?", answer: "Head to “Sell on NikiMart”, register your shop, complete quick verification, and start listing products, preorders, or services." },
    { id: "faq-protection", question: "Is my purchase protected?", answer: "Yes. Orders are covered by NikiMart Buyer Protection. If something goes wrong, our support team helps resolve it." },
  ];
  for (const [index, f] of faqs.entries()) {
    await prisma.faq.upsert({
      where: { id: f.id },
      update: { question: f.question, answer: f.answer, order: index },
      create: { id: f.id, question: f.question, answer: f.answer, order: index },
    });
  }

  console.log("Seed complete.");
  console.log("Demo accounts (password: password123):");
  for (const u of demoUsers) console.log(`  ${u.role.padEnd(9)} ${u.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
