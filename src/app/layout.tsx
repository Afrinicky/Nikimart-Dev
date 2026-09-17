import type { Metadata } from "next";
import { Geist, Geist_Mono, Montserrat } from "next/font/google";
import "./globals.css";
import { LocationProvider } from "@/components/providers/LocationProvider";
import { CartProvider } from "@/components/providers/CartProvider";
import { ReferralCapture } from "@/components/providers/ReferralCapture";
import { getLocations } from "@/lib/locations";
import { siteUrl } from "@/lib/site";
import { TopBar } from "@/components/layout/TopBar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ChromeGate } from "@/components/layout/ChromeGate";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { AuthSession } from "@/components/providers/AuthSession";
import { RouteProgress } from "@/components/ui/motion";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The display face: headings, the wordmark, section titles.
 *
 * Montserrat, because it is the face the logo's own wordmark is drawn in — a
 * geometric grotesque with a circular "o" and a wide, even rhythm. The site
 * previously set headings in Space Grotesk, which is a distinctive technical
 * face and read as a developer tool rather than a marketplace beside the mark.
 */
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const SITE_DESCRIPTION =
  "Nickimart connects buyers to trusted local shops, sellers sourcing from abroad, campus vendors, service providers, and official Nickimart products across Ghana.";

export const metadata: Metadata = {
  // Makes relative OG/canonical URLs absolute — required for link previews
  // (WhatsApp, Facebook, X, etc.) to resolve images and links correctly.
  metadataBase: new URL(siteUrl()),
  title: "Nickimart — Shop smart. Sell faster. Deliver closer.",
  description: SITE_DESCRIPTION,
  openGraph: {
    siteName: "Nickimart",
    type: "website",
    title: "Nickimart — Shop smart. Sell faster. Deliver closer.",
    description: SITE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image" },
};

// Everything under this layout may be served from cache for up to a minute.
//
// This was `force-dynamic`, which meant every page on the site — including the
// homepage and every product page a crawler walks — was rendered from scratch,
// with fresh database queries, for every single hit. That is what spent the
// bandwidth allowance.
//
// A minute is short enough that an admin edit shows up while they are still
// looking at it, and long enough that a burst of traffic costs one render.
// Anything personal stays dynamic on its own: reading cookies or the session
// opts a route out automatically, which covers the cart, checkout, the account
// pages and every dashboard — and those also set `force-dynamic` themselves.
//
// The build no longer being independent of the database is the trade. Every
// read in this tree already falls back to empty on failure rather than
// throwing, so a build without DATABASE_URL still succeeds; it would just
// prerender thin pages, and the revalidate above replaces them within the
// minute.
export const revalidate = 60;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locations = await getLocations();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${montserrat.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-niki-surface text-niki-ink">
        <ReferralCapture />
        {/* A thin bar under the header while a route is loading, so a tap is
            never followed by a silent pause. */}
        <RouteProgress />
        <AuthSession>
          <LocationProvider locations={locations}>
            <CartProvider>
              <ChromeGate>
                <TopBar />
                <Header />
              </ChromeGate>
              <main className="flex-1">{children}</main>
              <ChromeGate>
                <Footer />
                <MobileBottomNav />
              </ChromeGate>
            </CartProvider>
          </LocationProvider>
        </AuthSession>
      </body>
    </html>
  );
}
