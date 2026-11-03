import type { Metadata } from "next";
import { EyeOff, Package, Pencil, Plus, Store } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { ActionLink } from "@/components/ui/motion";
import { PanelHeading } from "@/components/admin/ModuleHeader";
import { ServiceModuleHeader } from "@/components/admin/ServiceModuleHeader";
import { requireDataAdmin } from "@/lib/data-bundles/session";
import { getAllServices } from "@/lib/data-bundles/services";
import { toggleService } from "@/lib/data-bundles/service-admin-actions";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Products — Admin — Nickimart" };
export const dynamic = "force-dynamic";

/**
 * The catalogue: everything Nickimart will do for somebody, and what it costs.
 *
 * One card per service rather than a table, because a service is not one row —
 * it is a picture, a handful of options at different prices, and a form. The
 * card shows the two numbers an admin is actually checking (what a customer
 * pays, and what an agent is charged) and leads into the editor for the rest.
 */
export default async function AdminServicesPage() {
  await requireDataAdmin();
  const services = await getAllServices();

  return (
    <Container className="py-8">
      <ServiceModuleHeader />

      <section className="mt-6">
        <PanelHeading
          title="Catalogue"
          subtitle="Add a service, set its options and prices, and choose where it is sold."
        >
          <ActionLink
            href="/admin/data/products/new"
            className="flex items-center gap-2 rounded-full bg-niki-orange px-4 py-2.5 text-sm font-semibold text-white hover:bg-niki-orange-light"
          >
            <Plus className="h-4 w-4" />
            New product
          </ActionLink>
        </PanelHeading>

        {services.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-niki-edge">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-niki-surface text-niki-ink/40">
              <Package className="h-5 w-5" />
            </span>
            <p className="mt-3 font-display font-bold text-niki-ink">No products yet</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-niki-ink/60">
              Add the first service — a registration, a certificate, an application — and it
              appears on the store and on every agent storefront that wants it.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {services.map((s) => {
              const live = s.variants.filter((v) => v.isActive && v.price > 0);
              const from = live.reduce((min, v) => (min === 0 ? v.price : Math.min(min, v.price)), 0);
              const resold = live.filter((v) => v.agentPrice > 0).length;

              return (
                <article
                  key={s.id}
                  className={cn(
                    "overflow-hidden rounded-2xl bg-white ring-1 ring-niki-edge",
                    !s.isActive && "opacity-70",
                  )}
                >
                  <div className="flex items-start gap-4 p-5">
                    <span
                      className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl"
                      style={{
                        background: `linear-gradient(135deg, ${s.accentFrom}, ${s.accentTo})`,
                      }}
                    >
                      {s.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={s.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        s.icon
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-display font-bold text-niki-ink">{s.name}</h3>
                        {!s.isActive ? (
                          <span className="rounded-md bg-niki-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-niki-ink/60">
                            Suspended
                          </span>
                        ) : null}
                        {s.isActive && !s.onStore ? (
                          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            Agents only
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-niki-ink/60">{s.tagline || "—"}</p>
                      <p className="mt-1 font-mono text-[11px] text-niki-ink/40">/{s.slug}</p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-3 gap-2 border-t border-niki-edge bg-niki-surface/60 px-5 py-3 text-sm">
                    <div>
                      <dt className="text-[11px] font-medium text-niki-ink/45">Options</dt>
                      <dd className="font-figures font-bold text-niki-ink">
                        {live.length}
                        {resold < live.length ? (
                          <span className="ml-1 text-xs font-medium text-niki-ink/45">
                            ({resold} resold)
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium text-niki-ink/45">From</dt>
                      <dd className="font-figures font-bold text-niki-ink">
                        {from > 0 ? formatPrice(from) : "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-medium text-niki-ink/45">Questions</dt>
                      <dd className="font-figures font-bold text-niki-ink">{s.fields.length}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2 border-t border-niki-edge px-5 py-3">
                    <ActionLink
                      href={`/admin/data/products/${s.id}`}
                      className="flex items-center gap-1.5 rounded-lg bg-niki-black px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </ActionLink>
                    <form action={toggleService}>
                      <input type="hidden" name="id" value={s.id} />
                      <button
                        type="submit"
                        className="flex items-center gap-1.5 rounded-lg bg-niki-surface px-3.5 py-2 text-xs font-semibold text-niki-ink/70 hover:bg-niki-black/5"
                      >
                        {s.isActive ? (
                          <>
                            <EyeOff className="h-3.5 w-3.5" />
                            Suspend
                          </>
                        ) : (
                          <>
                            <Store className="h-3.5 w-3.5" />
                            Reopen
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </Container>
  );
}
