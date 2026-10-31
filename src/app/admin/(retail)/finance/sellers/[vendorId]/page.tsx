import { permanentRedirect } from "next/navigation";

/** Paying a seller is the settlements tab now, where the whole position is. */
export default async function RetiredPaySellerPage({
  params,
}: {
  params: Promise<{ vendorId: string }>;
}): Promise<never> {
  const { vendorId } = await params;
  permanentRedirect(`/admin/finance/settlements/${vendorId}`);
}
