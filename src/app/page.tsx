import {
  BadgeCheck,
  Clock3,
  History,
  ShieldCheck,
  Star,
  Store,
  UtensilsCrossed,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";
import { Hero } from "@/components/home/Hero";
import { GlobalBand } from "@/components/home/GlobalBand";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { CampusShowcase } from "@/components/home/CampusShowcase";
import { ProductSection } from "@/components/home/ProductSection";
import { VendorSection } from "@/components/home/VendorSection";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import {
  getProducts,
  getVendors,
  getVendorNameMap,
  getFeaturedProducts,
  getFlashSaleProducts,
  getFoodProducts,
  getOfficialProducts,
  getPreorderProducts,
  getServiceProducts,
} from "@/lib/catalog";

export default async function Home() {
  const [
    products,
    vendors,
    vendorNames,
    featuredProducts,
    flashSaleProducts,
    foodProducts,
    officialProducts,
    preorderProducts,
    serviceProducts,
  ] = await Promise.all([
    getProducts(),
    getVendors(),
    getVendorNameMap(),
    getFeaturedProducts(),
    getFlashSaleProducts(),
    getFoodProducts(),
    getOfficialProducts(),
    getPreorderProducts(),
    getServiceProducts(),
  ]);

  const localShopVendors = vendors.filter((v) => v.sellerTypes.includes("local_shop"));
  const topRatedVendors = [...vendors].sort((a, b) => b.rating - a.rating).slice(0, 6);
  const budgetProducts = products.filter((p) => p.price <= 100 && p.productType !== "preorder");
  const recentlyViewedProducts = featuredProducts.slice(0, 8);

  return (
    <>
      <Hero />

      <GlobalBand />

      <CategoryShowcase />

      <ProductSection
        title="Flash Sales"
        subtitle="Grab these deals before they're gone"
        viewAllHref="/products?badge=flash_sale"
        products={flashSaleProducts}
        vendorNames={vendorNames}
        icon={<Zap className="h-5 w-5 fill-niki-danger text-niki-danger" />}
        headerExtra={<CountdownTimer />}
      />

      <ProductSection
        title="Preorder Deals"
        subtitle="Discover imported and upcoming products from trusted sellers"
        viewAllHref="/preorders"
        products={preorderProducts}
        vendorNames={vendorNames}
        icon={<Clock3 className="h-5 w-5 text-niki-orange" />}
        notice={
          <p className="mb-4 rounded-xl bg-niki-gold/10 p-3 text-xs leading-relaxed text-amber-800 ring-1 ring-niki-gold/30 sm:text-sm">
            This is a preorder item. Please review the estimated arrival date, deposit
            requirement, balance payment rule, and refund policy before placing your order.
          </p>
        }
      />

      <VendorSection
        title="Local Shops Near You"
        subtitle="Trusted neighbourhood shops ready to deliver or meet you for pickup"
        viewAllHref="/shops"
        vendors={localShopVendors}
        icon={<Store className="h-5 w-5 text-niki-orange" />}
      />

      <CampusShowcase products={products} vendors={vendors} vendorNames={vendorNames} />

      <ProductSection
        title="NikiMart Official Store"
        subtitle="Verified, NikiMart-branded products you can always trust"
        viewAllHref="/categories/nikimart-official-store"
        products={officialProducts}
        vendorNames={vendorNames}
        icon={<BadgeCheck className="h-5 w-5 text-niki-orange" />}
        tone="dark"
      />

      <VendorSection
        title="Top Rated Vendors"
        subtitle="Sellers our community trusts and loves"
        viewAllHref="/shops"
        vendors={topRatedVendors}
        icon={<ShieldCheck className="h-5 w-5 text-niki-orange" />}
      />

      <ProductSection
        title="Services Near You"
        subtitle="Book trusted professionals for everyday tasks"
        viewAllHref="/services"
        products={serviceProducts}
        vendorNames={vendorNames}
        icon={<Wrench className="h-5 w-5 text-niki-orange" />}
      />

      <ProductSection
        title="Food Near You"
        subtitle="Fresh meals from vendors close to you"
        viewAllHref="/products?category=food-drinks"
        products={foodProducts}
        vendorNames={vendorNames}
        icon={<UtensilsCrossed className="h-5 w-5 text-niki-orange" />}
      />

      <ProductSection
        title="Student Budget Zone"
        subtitle="Quality picks under GH₵100"
        viewAllHref="/products?maxPrice=100"
        products={budgetProducts}
        vendorNames={vendorNames}
        icon={<Wallet className="h-5 w-5 text-niki-orange" />}
      />

      <ProductSection
        title="Recently Viewed"
        subtitle="Pick up where you left off"
        products={recentlyViewedProducts}
        vendorNames={vendorNames}
        icon={<History className="h-5 w-5 text-niki-orange" />}
      />

      <ProductSection
        title="Featured Picks"
        subtitle="Hand-picked products our team loves right now"
        products={featuredProducts.slice(0, 6)}
        vendorNames={vendorNames}
        icon={<Star className="h-5 w-5 fill-niki-gold text-niki-gold" />}
      />
    </>
  );
}
