import type { ReactNode } from "react";
import type { Vendor } from "@/lib/types";
import { Container } from "@/components/ui/Container";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { ScrollRail, RailItem } from "@/components/ui/ScrollRail";
import { VendorCard } from "@/components/vendor/VendorCard";

export function VendorSection({
  title,
  subtitle,
  viewAllHref,
  vendors,
  icon,
}: {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  vendors: Vendor[];
  icon?: ReactNode;
}) {
  if (vendors.length === 0) return null;

  return (
    <section className="py-10 sm:py-12">
      <Container>
        <SectionHeading title={title} subtitle={subtitle} viewAllHref={viewAllHref} icon={icon} />
        <ScrollRail>
          {vendors.map((vendor) => (
            <RailItem key={vendor.id}>
              <VendorCard vendor={vendor} />
            </RailItem>
          ))}
        </ScrollRail>
      </Container>
    </section>
  );
}
