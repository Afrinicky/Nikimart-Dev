import { permanentRedirect } from "next/navigation";

/** Moved into the settings console — it configures the storefront. */
export default function RetiredPage(): never {
  permanentRedirect("/admin/settings/carousel");
}
