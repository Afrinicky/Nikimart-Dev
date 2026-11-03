import Link from "next/link";
import { ArrowRight, Clock3 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { getHouseShelf } from "@/lib/data-bundles/services";
import { getServicesConfig } from "@/lib/data-bundles/settings";
import { formatPrice } from "@/lib/format";

/**
 * Registrations and services, on the Nickimart homepage.
 *
 * Off by default and switched on from Admin → Data bundles → Products, because
 * the homepage is a shopping page and paperwork is not what most people come
 * for. When it is on it reads as one more thing this shop does rather than a
 * different business: the same card shape as everything else on the page, and
 * at most four of them, with the rest a click away.
 *
 * Renders nothing at all when the shelf is closed or empty, so the switch
 * being on never leaves an empty band on the front page.
 */
export async function ServicesSection() {
  const config = await getServicesConfig();
  if (!config.enabled || !config.onHomepage) return null;

  const shelf = (await getHouseShelf()).slice(0, 4);
  if (shelf.length === 0) return null;

  return (
    <section className="border-t border-niki-edge bg-white py-10">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold text-niki-ink sm:text-2xl">
              {config.heading}
            </h2>
            {config.blurb ? (
              <p className="mt-1 max-w-xl text-sm text-niki-ink/60">{config.blurb}</p>
            ) : null}
          </div>
          <Link
            href="/data-bundles"
            className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-niki-orange hover:underline"
          >
            See all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shelf.map((s) => (
            <Link
              key={s.slug}
              href={`/data-bundles/services/${s.slug}`}
              className="group niki-press niki-lift flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-niki-edge hover:shadow-xl"
            >
              <div
                className="flex items-center justify-between gap-2 px-4 py-3.5"
                style={{ background: `linear-gradient(135deg, ${s.accentFrom}, ${s.accentTo})` }}
              >
                <span className="min-w-0 truncate font-display text-sm font-bold text-white">
                  {s.name}
                </span>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/20 text-sm">
                  {s.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    s.icon
                  )}
                </span>
              </div>

              <div className="flex flex-1 flex-col px-4 py-3.5">
                <p className="line-clamp-2 text-xs text-niki-ink/55">{s.tagline}</p>
                <div className="mt-3 flex items-end justify-between gap-2">
                  <span>
                    <span className="block text-[11px] font-medium text-niki-ink/45">
                      {s.variants.length > 1 ? "From" : "Fee"}
                    </span>
                    <span className="font-figures text-lg font-bold text-niki-ink">
                      {formatPrice(s.fromPrice)}
                    </span>
                  </span>
                  {s.variants[0]?.turnaround ? (
                    <span className="flex items-center gap-1 text-[11px] text-niki-ink/45">
                      <Clock3 className="h-3 w-3" />
                      {s.variants[0].turnaround}
                    </span>
                  ) : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
