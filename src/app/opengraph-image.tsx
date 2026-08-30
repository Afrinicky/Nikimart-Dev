import { OG_SIZE, OG_CONTENT_TYPE, renderOgJpeg, ogResponse, OgBrandMark } from "@/lib/og";

// Branded card for the homepage — and therefore for affiliate referral links,
// which are the homepage with a ?ref= code (e.g. /?ref=ABC). This is the image
// that represents the whole site in a WhatsApp or Facebook preview, so it
// carries the mark and not just the name.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Nickimart — Shop smart. Sell faster. Deliver closer.";

export default async function OgImage() {
  const jpeg = await renderOgJpeg(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: "linear-gradient(135deg, #1f1f1f, #131313)",
        justifyContent: "center",
        padding: "0 96px",
        color: "#ffffff",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <OgBrandMark height={84} />
        <div style={{ display: "flex", fontSize: 88, fontWeight: 800 }}>
          <span>Nick</span>
          <span style={{ color: "#FF6A00" }}>imart</span>
        </div>
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
