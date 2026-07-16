import { redirect } from "next/navigation";

// The Buy-for-Me service has been retired in favour of the global-shopping
// experience, where imported items are sold directly and appear in the catalog.
export default function BuyForMePage() {
  redirect("/global-shopping");
}
