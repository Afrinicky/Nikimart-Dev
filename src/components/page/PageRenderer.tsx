import {
  BadgeCheck,
  Clock3,
  History,
  Package,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Hero } from "@/components/home/Hero";
import { GlobalBand } from "@/components/home/GlobalBand";
import { CategoryShowcase } from "@/components/home/CategoryShowcase";
import { CampusShowcase } from "@/components/home/CampusShowcase";
import { ProductSection } from "@/components/home/ProductSection";
import { VendorSection } from "@/components/home/VendorSection";
import { CountdownTimer } from "@/components/ui/CountdownTimer";
import { Container } from "@/components/ui/Container";
import {
  getProducts,
  getVendors,
  getVendorNameMap,
} from "@/lib/catalog";
import type { Product, Vendor } from "@/lib/types";
import type { RenderSection } from "@/lib/pages";
import type { SectionConfig } from "@/lib/page-blocks";

const SECTION_ICONS: Record<string, LucideIcon> = {
  zap: Zap,
  clock: Clock3,
  store: Store,
  "badge-check": BadgeCheck,
  shield: ShieldCheck,
  wrench: Wrench,
  utensils: UtensilsCrossed,
  wallet: Wallet,
  history: History,
  star: Star,
  sparkles: Sparkles,
  package: Package,
};

function icon(name?: string) {
  const Icon = name ? SECTION_ICONS[name] : undefined;
  return Icon ? <Icon className="h-5 w-5 text-niki-orange" /> : undefined;
}

function productCollection(all: Product[], collection?: string): Product[] {
  switch (collection) {
    case "featured":
      return all.filter((p) => p.isFeatured);
    case "flash_sale":
      return all.filter((p) => p.badges.includes("flash_sale"));
    case "preorder":
      return all.filter((p) => p.productType === "preorder");
    case "service":
      return all.filter((p) => p.productType === "service");
    case "food":
      return all.filter((p) => p.productType === "food");
    case "official":
      return all.filter((p) => p.isOfficial);
    case "budget":
      return all.filter((p) => p.price <= 100 && p.productType !== "preorder");
    case "recently_viewed":
      return all.filter((p) => p.isFeatured).slice(0, 8);
    default:
      return all.slice(0, 10);
  }
}

function vendorCollection(all: Vendor[], filter?: string): Vendor[] {
  switch (filter) {
    case "local_shop":
      return all.filter((v) => v.sellerTypes.includes("local_shop"));
    case "top_rated":
      return [...all].sort((a, b) => b.rating - a.rating).slice(0, 6);
    default:
      return all;
  }
}

export async function PageRenderer({ sections }: { sections: RenderSection[] }) {
  const needsCatalog = sections.some((s) => ["product_rail", "vendor_rail", "campus"].includes(s.type));
  const [products, vendors, vendorNames] = needsCatalog
    ? await Promise.all([getProducts(), getVendors(), getVendorNameMap()])
    : [[], [], {}];

  return (
    <>
      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          type={section.type}
          config={section.config}
          products={products}
          vendors={vendors}
          vendorNames={vendorNames}
        />
      ))}
    </>
  );
}

function SectionBlock({
  type,
  config,
  products,
  vendors,
  vendorNames,
}: {
  type: string;
  config: SectionConfig;
  products: Product[];
  vendors: Vendor[];
  vendorNames: Record<string, string>;
}) {
  switch (type) {
    case "hero":
      return <Hero />;
    case "global_band":
      return <GlobalBand />;
    case "category_grid":
      return <CategoryShowcase />;
    case "campus":
      return <CampusShowcase products={products} vendors={vendors} vendorNames={vendorNames} />;
    case "product_rail":
      return (
        <ProductSection
          title={config.title ?? "Products"}
          subtitle={config.subtitle}
          viewAllHref={config.viewAllHref}
          products={productCollection(products, config.collection)}
          vendorNames={vendorNames}
          icon={icon(config.icon)}
          tone={config.tone}
          headerExtra={config.showCountdown ? <CountdownTimer /> : undefined}
          notice={
            config.notice ? (
              <p className="mb-4 rounded-xl bg-niki-gold/10 p-3 text-xs leading-relaxed text-amber-800 ring-1 ring-niki-gold/30 sm:text-sm">
                {config.notice}
              </p>
            ) : undefined
          }
        />
      );
    case "vendor_rail":
      return (
        <VendorSection
          title={config.title ?? "Shops"}
          subtitle={config.subtitle}
          viewAllHref={config.viewAllHref}
          vendors={vendorCollection(vendors, config.filter)}
          icon={icon(config.icon)}
        />
      );
    case "rich_text":
      return (
        <section className="py-10 sm:py-12">
          <Container className="max-w-3xl">
            {config.title ? (
              <h2 className="font-display text-2xl font-bold text-niki-ink sm:text-3xl">{config.title}</h2>
            ) : null}
            {config.body ? (
              <div className="mt-4 space-y-4 text-sm leading-relaxed text-niki-ink/70 sm:text-base">
                {config.body.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : null}
          </Container>
        </section>
      );
    case "banner": {
      const dark = config.tone === "dark";
      return (
        <section className="py-8">
          <Container>
            <div className={`rounded-3xl p-8 ${dark ? "bg-niki-navy text-white" : "bg-niki-gold/10 text-niki-ink ring-1 ring-niki-gold/30"}`}>
              {config.title ? <h3 className="font-display text-xl font-bold">{config.title}</h3> : null}
              {config.text ? (
                <p className={`mt-2 max-w-2xl text-sm ${dark ? "text-white/80" : "text-niki-ink/70"}`}>{config.text}</p>
              ) : null}
            </div>
          </Container>
        </section>
      );
    }
    default:
      return null;
  }
}
