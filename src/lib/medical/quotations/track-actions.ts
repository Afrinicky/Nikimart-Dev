"use server";

import { medicalDb, isMedicalConfigured } from "@/lib/medical/db";
import { medicalCustomer } from "@/lib/medical/customer";
import { looksLikeEmail } from "@/lib/medical/quotations/request-input";

/**
 * Finding your own request again without an account.
 *
 * Two things are needed: the reference, which is printed on everything we
 * send, and the email address the request carries. One without the other is
 * not enough — a reference alone is guessable in sequence, and an email alone
 * would list somebody's dealings with us to anybody who knows their address.
 *
 * The answer is deliberately the same whether the reference does not exist or
 * the email does not match it: a lookup that distinguishes the two is a lookup
 * that confirms which references exist.
 */

export type TrackResult =
  | { ok: true; kind: "request"; token: string }
  | { ok: true; kind: "order"; reference: string }
  | { ok: false; error: string };

const NOT_FOUND =
  "No request or order matches that reference and email address. Check both, or ring us.";

export async function trackRecord(input: {
  reference?: string;
  email?: string;
}): Promise<TrackResult> {
  if (!isMedicalConfigured()) return { ok: false, error: NOT_FOUND };

  const reference = (input.reference ?? "").trim().toUpperCase().slice(0, 40);
  const email = (input.email ?? "").trim().toLowerCase().slice(0, 160);

  if (!reference) return { ok: false, error: "Enter the reference from your confirmation." };
  if (!email || !looksLikeEmail(email)) {
    return { ok: false, error: "Enter the email address the request was sent with." };
  }

  try {
    const request = await medicalDb.quotationRequest.findUnique({
      where: { reference },
      select: { accessToken: true, contactEmail: true, customerId: true },
    });

    if (request) {
      const matchesContact = request.contactEmail.trim().toLowerCase() === email;
      // A request made while signed in may carry no contact email of its own.
      // The account's own address answers for it.
      const customer = matchesContact ? null : await medicalCustomer();
      const matchesAccount =
        customer !== null &&
        customer.customerId === request.customerId &&
        customer.email.trim().toLowerCase() === email;

      if (matchesContact || matchesAccount) {
        return { ok: true, kind: "request", token: request.accessToken };
      }
      return { ok: false, error: NOT_FOUND };
    }

    // An order reference is recognised, and answered honestly: there is no
    // page that shows an order to somebody who is not signed in, so saying
    // "not found" would be a lie and showing one would be a disclosure.
    const order = await medicalDb.salesOrder.findUnique({
      where: { reference },
      select: { reference: true },
    });
    if (order) return { ok: true, kind: "order", reference: order.reference };

    return { ok: false, error: NOT_FOUND };
  } catch {
    return { ok: false, error: "That could not be looked up just now. Try again." };
  }
}
