import { permanentRedirect } from "next/navigation";

/**
 * Transactions moved into the finance console.
 *
 * It was a second sidebar entry over the same cedis as Finance — one held the
 * totals, the other the rows they were made of, and each carried its own idea
 * of what had gone out to sellers. They are tabs of one module now.
 */
export default function RetiredTransactionsPage(): never {
  permanentRedirect("/admin/finance/transactions");
}
