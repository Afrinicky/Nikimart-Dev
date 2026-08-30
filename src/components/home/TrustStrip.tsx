import Link from "next/link";
import { HandCoins, MapPin, ShieldCheck, UserCheck } from "lucide-react";
import { Container } from "@/components/ui/Container";

/**
 * The dark band above the footer.
 *
 * Two jobs. The page runs a long way between the flash-sale block and the
 * footer with nothing but white cards on a near-white ground, and it went soft
 * in the middle; this is the weight that breaks that run. And it answers the
 * question a first-time buyer on a shop they have not heard of is actually
 * asking — what happens to my money — at the point they have finished
 * scrolling the catalogue and are deciding whether to trust it.
 *
 * Every claim here is one the site already makes on /buyer-protection and
 * /how-it-works, and each links to the page that explains it. Nothing is
 * invented for the sake of filling four columns: a promise made in a band like
 * this and nowhere else is one nobody is accountable for.
 */
const PILLARS = [
  {
    icon: HandCoins,
    title: "Secure payments",
    body: "Held safely and only released once your order is on its way.",
    href: "/buyer-protection",
  },
  {
    icon: ShieldCheck,
    title: "Buyer protection",
    body: "Damaged, defective or not as described? You're covered.",
    href: "/buyer-protection",
  },
  {
    icon: MapPin,
    title: "OTP pickup",
    body: "Collect with a one-time code, so only you can take the package.",
    href: "/pickup-points",
  },
  {
    icon: UserCheck,
    title: "Verified sellers",
    body: "We verify shops — look for the badge before you buy.",
    href: "/shops",
  },
];

export function TrustStrip() {
  // A step lighter than the footer directly beneath it. At the same black the
  // two ran together into one tall slab with an unexplained gap in the middle;
  // the step reads as two bands.
  return (
    <section className="border-b border-white/10 bg-niki-black-soft text-white">
      <Container className="py-10 sm:py-12">
        <h2 className="font-display text-lg font-extrabold tracking-tight sm:text-xl">
          Why shop on Nick<span className="text-niki-orange">imart</span>
        </h2>
        <div className="mt-6 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, body, href }) => (
            <Link
              key={title}
              href={href}
              className="niki-press group flex gap-3 rounded-xl p-1 -m-1 hover:bg-white/5"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-niki-orange/15 text-niki-orange ring-1 ring-niki-orange/25">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold group-hover:text-niki-orange">{title}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-white/60">{body}</span>
              </span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
