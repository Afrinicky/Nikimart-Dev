"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { BusyButton } from "@/components/ui/motion";
import { startServicePayment } from "@/lib/data-bundles/service-assist";
import { formatPrice } from "@/lib/format";

/**
 * Paying a link somebody was sent.
 *
 * The amount is re-read on the server from the order itself, so this button
 * carries no price of its own — what is printed on it is only what to expect.
 */
export function ServicePayButton({
  reference,
  amount,
}: {
  reference: string;
  amount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setPending(true);
    const result = await startServicePayment(reference);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    if (result.authorizationUrl) {
      // Hand over to Paystack; stay pending right up to the redirect.
      window.location.href = result.authorizationUrl;
      return;
    }
    router.push(`/data-bundles/services/order/${encodeURIComponent(reference)}?paid=1`);
  }

  return (
    <div>
      {error ? (
        <p className="animate-fade-up mb-3 rounded-xl bg-niki-danger/10 px-4 py-3 text-sm font-medium text-niki-danger">
          {error}
        </p>
      ) : null}

      <BusyButton
        type="button"
        busy={pending}
        onClick={pay}
        pendingLabel="Opening Paystack…"
        icon={<CreditCard className="h-4 w-4" />}
        className="w-full rounded-xl bg-niki-orange px-4 py-3.5 text-sm font-bold text-white hover:bg-niki-orange-light"
      >
        {`Pay ${formatPrice(amount)}`}
      </BusyButton>

      <p className="mt-3 text-center text-[11px] text-niki-ink/40">
        Secured by Paystack · MTN MoMo, Telecel Cash, AT Money &amp; cards
      </p>
    </div>
  );
}
