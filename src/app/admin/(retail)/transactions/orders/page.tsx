import { permanentRedirect } from "next/navigation";

/** Order economics is a tab of the finance console now. */
export default function RetiredOrderEconomicsPage(): never {
  permanentRedirect("/admin/finance/orders");
}
