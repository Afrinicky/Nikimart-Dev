import {
  OG_SIZE,
  OG_CONTENT_TYPE,
  renderOgJpeg,
  ogResponse,
  loadImageBuffer,
  coverJpeg,
  squareDataUrl,
} from "@/lib/og";
import { getVendorBySlug } from "@/lib/catalog";
import { absoluteImageUrl } from "@/lib/site";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Nickimart shop";

export default async function ShopOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);

  // A cover banner makes the strongest "catalogue" preview — use it full-bleed.
  if (vendor?.bannerUrl) {
    const buf = await loadImageBuffer(absoluteImageUrl(vendor.bannerUrl));
    if (buf) return ogResponse(await coverJpeg(buf));
  }

  const name = (vendor?.businessName ?? "Nickimart Shop").slice(0, 46);
  const initials = (vendor?.initials ?? "NM").slice(0, 3);
  const from = vendor?.accentFrom ?? "#FF8A00";
  const to = vendor?.accentTo ?? "#FFC107";
  const verified = vendor?.verificationStatus === "verified";

  // Fall back to a branded card: the shop logo (if any) or its initials badge.
  const logoBuf = vendor?.logoUrl ? await loadImageBuffer(absoluteImageUrl(vendor.logoUrl)) : null;
  const logo = logoBuf ? await squareDataUrl(logoBuf) : null;

  const jpeg = await renderOgJpeg(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #0e1f36, #07111f)",
        padding: "80px 90px",
        color: "#ffffff",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 800 }}>
        <span>Nick</span>
        <span style={{ color: "#FF8A00" }}>imart</span>
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} width={188} height={188} style={{ width: 188, height: 188, borderRadius: 40, objectFit: "cover", marginRight: 40 }} />
        ) : (
          <div
            style={{
              display: "flex",
              width: 188,
              height: 188,
              borderRadius: 40,
              background: `linear-gradient(135deg, ${from}, ${to})`,
              alignItems: "center",
              justifyContent: "center",
              fontSize: 84,
              fontWeight: 800,
              color: "#0e1f36",
              marginRight: 40,
            }}
          >
            {initials}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.72)", marginTop: 14 }}>
            {verified ? "Verified shop on Nickimart" : "Shop on Nickimart"}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 28, color: "rgba(255,255,255,0.55)" }}>Shop smart. Sell faster. Deliver closer.</div>
    </div>,
  );
  return ogResponse(jpeg);
}
