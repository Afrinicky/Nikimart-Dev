import type { Metadata } from "next";
import { RotateCcw } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { formatPrice } from "@/lib/format";
import { getAfaRegistrations } from "@/lib/data-bundles/reporting";
import { retryAfaRegistration } from "@/lib/data-bundles/admin-actions";
import { DATA_STATUS_LABELS, DATA_STATUS_TONES, isDataOrderStatus } from "@/lib/data-bundles/networks";

export const metadata: Metadata = { title: "AFA Registrations — Admin — NikiMart" };
export const dynamic = "force-dynamic";

export default async function AdminAfaPage() {
  const rows = await getAfaRegistrations();

  return (
    <Container className="py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-niki-ink">AFA registrations</h1>
        <p className="mt-1 text-sm text-niki-ink/60">
          {rows.length} {rows.length === 1 ? "registration" : "registrations"} · submitted to the
          provider once payment clears
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 rounded-2xl bg-white p-8 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">
          No AFA registrations yet.
        </p>
      ) : (
        <div className="mt-6 space-y-3">
          {rows.map((r) => {
            const known = isDataOrderStatus(r.status) ? r.status : "processing";
            return (
              <div key={r.id} className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-niki-ink">{r.fullName}</p>
                    <p className="mt-0.5 text-sm text-niki-ink/60">
                      {r.phoneNumber} · {r.idNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-niki-ink/50">
                      Born {r.dateOfBirth} · {r.town} · {r.occupation}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-niki-ink/40">
                      {r.reference}
                      {r.providerStatus ? ` · provider: ${r.providerStatus}` : ""}
                      {" · "}
                      {r.createdAt.toLocaleString("en-GH")}
                    </p>
                    {r.providerMessage && known === "failed" ? (
                      <p className="mt-1 text-xs text-niki-danger">{r.providerMessage}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${DATA_STATUS_TONES[known]}`}>
                      {DATA_STATUS_LABELS[known]}
                    </span>
                    <span className="font-display font-bold text-niki-ink">{formatPrice(r.price)}</span>
                    {r.paymentStatus === "paid" && !r.providerId ? (
                      <form action={retryAfaRegistration}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="flex items-center gap-1.5 rounded-lg bg-niki-orange px-3 py-1.5 text-xs font-semibold text-white hover:bg-niki-orange-light"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Submit now
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Container>
  );
}
