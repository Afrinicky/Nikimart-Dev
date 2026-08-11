import { OG_SIZE, OG_CONTENT_TYPE, renderOgJpeg, ogResponse } from "@/lib/og";

// Branded card for the homepage — and therefore for affiliate referral links,
// which are the homepage with a ?ref= code (e.g. nikimart.vercel.app/?ref=ABC).
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "NikiMart — Shop smart. Sell faster. Deliver closer.";

export default async function OgImage() {
  const jpeg = await renderOgJpeg(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #0e1f36, #07111f)",
        justifyContent: "center",
        padding: "0 96px",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", fontSize: 88, fontWeight: 800 }}>
        <span>Niki</span>
        <span style={{ color: "#FF8A00" }}>Mart</span>
      </div>
      <div style={{ fontSize: 46, fontWeight: 700, marginTop: 28, maxWidth: 960 }}>
        Shop smart. Sell faster. Deliver closer.
      </div>
      <div style={{ fontSize: 30, color: "rgba(255,255,255,0.7)", marginTop: 18, maxWidth: 960 }}>
        Trusted local shops, preorders & official products across Ghana.
      </div>
    </div>,
  );
  return ogResponse(jpeg);
}
