import { Mail, MapPin, Phone } from "lucide-react";
import { MedicalLink } from "@/components/medical/ui/MedicalLink";
import { MedicalLogo } from "@/components/medical/ui/MedicalLogo";
import type { CategoryNode } from "@/lib/medical/categories";

/**
 * The footer.
 *
 * Four columns and a legal line, and nothing in it the business cannot stand
 * behind. No certification badges, no payment-card wall, no "100% secure"
 * seal: a buyer who is deciding whether to put a supplier on a purchase order
 * is reassured by an address and a phone number, not by a graphic.
 *
 * The catalogue column is the real category tree, so it cannot drift out of
 * date the way a hand-written list of links does.
 */

const COMPANY = [
  { href: "/medicals/about", label: "About Nickimart Medical" },
  { href: "/medicals/suppliers", label: "Supply to us" },
  { href: "/medicals/redistributors", label: "Become a redistributor" },
  { href: "/medicals/support", label: "Contact us" },
];

const HELP = [
  { href: "/medicals/quotations/new", label: "Request a quotation" },
  { href: "/medicals/orders/track", label: "Track an order" },
  { href: "/medicals/help/ordering", label: "How ordering works" },
  { href: "/medicals/help/delivery", label: "Delivery and lead times" },
  { href: "/medicals/help/returns", label: "Returns" },
];

const LEGAL = [
  { href: "/medicals/legal/terms", label: "Terms of sale" },
  { href: "/medicals/legal/privacy", label: "Privacy" },
];

export function MedicalFooter({ categories }: { categories: CategoryNode[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-20 bg-medi-ink text-white/70">
      <div className="mx-auto max-w-[80rem] px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <MedicalLogo tone="light" />
            <p className="medi-prose mt-4 text-[0.875rem] text-white/65">
              Laboratory reagents, diagnostic kits, consumables and equipment for hospitals,
              laboratories and clinics. Sourced in Ghana and internationally, supplied against
              a quotation or bought outright.
            </p>

            <address className="mt-6 space-y-2.5 not-italic">
              <a
                href="tel:+233200000000"
                className="medi-focus flex items-center gap-2.5 rounded text-[0.875rem] text-white/80 transition-colors hover:text-white"
              >
                <Phone className="h-4 w-4 shrink-0 text-medi-teal-300" aria-hidden />
                <span className="font-figures">+233 20 000 0000</span>
              </a>
              <a
                href="mailto:medical@nickimart.com"
                className="medi-focus flex items-center gap-2.5 rounded text-[0.875rem] text-white/80 transition-colors hover:text-white"
              >
                <Mail className="h-4 w-4 shrink-0 text-medi-teal-300" aria-hidden />
                medical@nickimart.com
              </a>
              <p className="flex items-start gap-2.5 text-[0.875rem] text-white/70">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-medi-teal-300" aria-hidden />
                Accra, Ghana
              </p>
            </address>
          </div>

          <FooterColumn
            heading="Catalogue"
            links={categories.slice(0, 7).map((category) => ({
              href: `/medicals/categories/${category.slug}`,
              label: category.name,
            }))}
          />
          <FooterColumn heading="Ordering" links={HELP} />
          <FooterColumn heading="Company" links={COMPANY} />
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-medi-rule-light pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="medi-meta text-white/55">
            © {year} Nickimart Medical. Part of Nickimart.
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {LEGAL.map((item) => (
              <li key={item.href}>
                <MedicalLink
                  href={item.href}
                  className="medi-meta medi-focus rounded text-white/60 transition-colors hover:text-white"
                >
                  {item.label}
                </MedicalLink>
              </li>
            ))}
            <li>
              {/* The mall is a route in this same application, not another
                  site, so it is a Link: a full page load here would throw away
                  the session and the providers above it for nothing. */}
              <MedicalLink
                href="/"
                className="medi-meta medi-focus rounded text-white/60 transition-colors hover:text-white"
              >
                Nickimart marketplace
              </MedicalLink>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  heading,
  links,
}: {
  heading: string;
  links: { href: string; label: string }[];
}) {
  if (links.length === 0) return null;
  return (
    <nav aria-label={heading}>
      <h2 className="text-[0.875rem] font-semibold text-white">{heading}</h2>
      <ul className="mt-3.5 space-y-2.5">
        {links.map((link) => (
          <li key={link.href}>
            <MedicalLink
              href={link.href}
              className="medi-focus rounded text-[0.875rem] text-white/65 transition-colors hover:text-white"
            >
              {link.label}
            </MedicalLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
