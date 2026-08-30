import type { MetadataRoute } from "next";

/**
 * The web app manifest, served at /manifest.webmanifest.
 *
 * What this actually controls is the icon and name someone gets when they add
 * the shop to a phone's home screen, and the colour of the browser chrome
 * around it on Android. Without it that shortcut is a screenshot of the page
 * under a truncated <title>, which is a poor thing to leave on a customer's
 * home screen.
 *
 * `maskable` matters on Android: the launcher crops every icon to whatever
 * shape the device uses, and an icon not declared maskable gets shrunk into a
 * white circle rather than filling it. The tile art already carries its own
 * padding inside the safe zone, so it can be declared both.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nickimart — Shop smart. Sell faster. Deliver closer.",
    short_name: "Nickimart",
    description:
      "Buy from trusted local shops, campus vendors, importers and service providers across Ghana.",
    start_url: "/",
    display: "standalone",
    background_color: "#eeeef0",
    theme_color: "#ff6a00",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
