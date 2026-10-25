import "server-only";
import { setting } from "@/lib/medical/settings";

/**
 * The business's own contact details, as configured.
 *
 * From settings rather than written into a page, so that changing the
 * telephone number is a row in the console rather than a deploy — and so that
 * the footer, the About page and a quotation document cannot disagree about
 * what it is.
 *
 * The fallbacks are the seeded values. A page that printed nothing when a
 * setting was missing would be a page with no way to reach anybody on it.
 */
export interface BusinessContact {
  name: string;
  email: string;
  phone: string;
  address: string;
}

export async function businessContact(): Promise<BusinessContact> {
  const [name, email, phone, address] = await Promise.all([
    setting("business.name", "Nickimart Medical"),
    setting("business.email", "medical@nickimart.com"),
    setting("business.phone", "+233 20 000 0000"),
    setting("business.address", "Accra, Ghana"),
  ]);
  return { name, email, phone, address };
}
