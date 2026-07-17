import { Container } from "@/components/ui/Container";
import { PromoCarousel } from "./PromoCarousel";
import { getBanners } from "@/lib/banners";

/**
 * Homepage top section: the promotional carousel. Category navigation and
 * global shopping now live in the nav sidebar, keeping the landing page focused
 * on promos and products.
 */
export async function Hero() {
  const slides = await getBanners();
  return (
    <section className="bg-niki-surface pt-4">
      <Container>
        <PromoCarousel slides={slides} />
      </Container>
    </section>
  );
}
