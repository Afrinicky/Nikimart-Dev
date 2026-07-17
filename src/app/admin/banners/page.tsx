import Link from "next/link";
import type { Metadata } from "next";
import { Pencil, Plus } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { getAllBanners } from "@/lib/banners";
import { deleteBanner } from "@/lib/banner-actions";

export const metadata: Metadata = { title: "Carousel Banners — Admin — NikiMart" };

export default async function AdminBannersPage() {
  const banners = await getAllBanners();

  return (
    <Container className="py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-niki-ink">Homepage Carousel</h1>
          <p className="mt-1 text-sm text-niki-ink/60">{banners.length} promotional {banners.length === 1 ? "banner" : "banners"}</p>
        </div>
        <Link
          href="/admin/banners/new"
          className="flex items-center gap-2 rounded-full bg-niki-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
        >
          <Plus className="h-4 w-4" />
          New banner
        </Link>
      </div>

      {banners.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">
          No banners yet. The homepage shows built-in default slides until you add your own.
        </p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {banners.map((b) => (
            <div key={b.id} className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
              <div
                className="relative flex h-32 flex-col justify-center gap-1 p-4"
                style={{ background: `linear-gradient(135deg, ${b.accentFrom}, ${b.accentTo})` }}
              >
                {b.eventWindow ? (
                  <span className="w-fit rounded-full bg-white/20 px-2 py-0.5 text-[9px] font-bold uppercase text-white">{b.eventWindow}</span>
                ) : null}
                <p className="max-w-[65%] font-display text-sm font-bold leading-tight text-white">{b.title}</p>
                {b.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.image} alt="" className="absolute right-0 top-0 h-full w-2/5 object-cover" />
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.isActive ? "bg-niki-success/10 text-niki-success" : "bg-niki-ink/10 text-niki-ink/60"}`}>
                  {b.isActive ? "Active" : "Hidden"}
                </span>
                <div className="flex items-center gap-1">
                  <Link href={`/admin/banners/${b.id}`} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-niki-ink/70 hover:bg-niki-navy/5">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Link>
                  <DeleteButton id={b.id} action={deleteBanner} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Container>
  );
}
