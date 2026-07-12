import type { Metadata } from "next";
import { Geist, Geist_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { LocationProvider } from "@/components/providers/LocationProvider";
import { CartProvider } from "@/components/providers/CartProvider";
import { getLocations } from "@/lib/locations";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NikiMart — Shop smart. Sell faster. Deliver closer.",
  description:
    "NikiMart connects buyers to trusted local shops, preorder sellers, campus vendors, service providers, and official NikiMart products across Ghana.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locations = await getLocations();
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-niki-surface text-niki-ink">
        <LocationProvider locations={locations}>
          <CartProvider>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
            <MobileBottomNav />
          </CartProvider>
        </LocationProvider>
      </body>
    </html>
  );
}
