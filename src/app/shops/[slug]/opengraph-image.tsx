import { OG_SIZE, OG_CONTENT_TYPE, renderOgJpeg, ogResponse } from "@/lib/og";
import { getVendorBySlug } from "@/lib/catalog";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "NikiMart shop";

export default async function ShopOgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const vendor = await getVendorBySlug(slug);

  const name = (vendor?.businessName ?? "NikiMart Shop").slice(0, 46);
  const initials = (vendor?.initials ?? "NM").slice(0, 3);
  const from = vendor?.accentFrom ?? "#FF8A00";
  const to = vendor?.accentTo ?? "#FFC107";
  const verified = vendor?.verificationStatus === "verified";

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
        <span>Niki</span>
        <span style={{ color: "#FF8A00" }}>Mart</span>
      </div>

      <div style={{ display: "flex", alignItems: "center" }}>
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
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 760 }}>
          <div style={{ fontSize: 66, fontWeight: 800, lineHeight: 1.05 }}>{name}</div>
          <div style={{ fontSize: 32, color: "rgba(255,255,255,0.72)", marginTop: 14 }}>
            {verified ? "Verified shop on NikiMart" : "Shop on NikiMart"}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 28, color: "rgba(255,255,255,0.55)" }}>Shop smart. Sell faster. Deliver closer.</div>
    </div>,
  );
  return ogResponse(jpeg);
}
