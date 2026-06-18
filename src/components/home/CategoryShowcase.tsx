import { LayoutGrid } from "lucide-react";
import { categories } from "@/lib/mock-data";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryCard } from "@/components/category/CategoryCard";

export function CategoryShowcase() {
  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeading
          title="Shop by Category"
          subtitle="Find exactly what you need, from gadgets to groceries"
          icon={<LayoutGrid className="h-5 w-5 text-niki-orange" />}
        />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8">
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </Container>
    </section>
  );
}
