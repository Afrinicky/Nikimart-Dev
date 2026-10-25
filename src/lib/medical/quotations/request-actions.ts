"use server";

import { medicalDb, isMedicalConfigured } from "@/lib/medical/db";
import { ensureMedicalCustomer, medicalCustomer } from "@/lib/medical/customer";
import { nextReference } from "@/lib/medical/numbering";
import { validateRequest, type RequestInput } from "@/lib/medical/quotations/request-input";

/**
 * The one way a quotation request gets into this business.
 *
 * Open to anybody, signed in or not — see the note on `QuotationRequest`: a
 * laboratory manager will not make an account before finding out whether you
 * stock the thing. A signed-in request is attached to the customer; an
 * anonymous one carries its own contact details and is read afterwards through
 * the access token this returns.
 *
 * Nothing the browser sends is trusted beyond what it is: product ids are
 * re-read from the catalogue, descriptions are written from the catalogue
 * where one matched, quantities are whole numbers inside bounds, and no price
 * is accepted at all. A request is a question, so there is nothing here to get
 * financially wrong — but a request that names a product we do not sell, or
 * describes it in words we did not write, is a quotation drafted from a lie.
 */

export type SubmitResult =
  | { ok: true; reference: string; token: string }
  | { ok: false; error: string; field?: string };

export async function submitQuotationRequest(input: RequestInput): Promise<SubmitResult> {
  if (!isMedicalConfigured()) {
    return { ok: false, error: "Requests are not being taken here yet." };
  }

  const checked = validateRequest(input);
  if (!checked.ok) return { ok: false, error: checked.error, field: checked.field };
  const request = checked.value;

  try {
    // Signed in: the request belongs to them and appears in their account.
    // Signed out: nothing is created, and the token is the only way back to it.
    const customer = await medicalCustomer().then((found) =>
      found ? found : ensureMedicalCustomer(),
    );

    // Every product id the browser sent, re-read. A line whose product has
    // been delisted since the page was cached keeps the customer's words and
    // loses the link, rather than pointing at something unsellable.
    const ids = request.lines.map((line) => line.productId).filter((id): id is string => !!id);
    const products = ids.length
      ? await medicalDb.medicalProduct.findMany({
          where: { id: { in: ids }, status: "ACTIVE" },
          select: { id: true, name: true, catalogueNumber: true, unitOfSale: true },
        })
      : [];
    const known = new Map(products.map((product) => [product.id, product]));

    const items = request.lines.map((line, index) => {
      const product = line.productId ? known.get(line.productId) : undefined;
      return {
        productId: product?.id ?? null,
        // The catalogue's words when it matched, theirs when it did not. The
        // item keeps its own description either way: a product renamed next
        // year must not rename what somebody asked for last year.
        description: product?.name ?? line.description,
        catalogueNumber: product?.catalogueNumber ?? line.catalogueNumber,
        quantity: line.quantity,
        unit: product?.unitOfSale ?? line.unit,
        notes: line.notes,
        position: index,
      };
    });

    const created = await medicalDb.$transaction(async (tx) => {
      const reference = await nextReference(tx, "REQUEST");

      const row = await tx.quotationRequest.create({
        data: {
          reference,
          customerId: customer?.customerId ?? null,
          organisationId: customer?.organisationId ?? null,
          contactName: request.contactName,
          contactEmail: request.contactEmail,
          contactPhone: request.contactPhone,
          institutionName: request.institutionName,
          institutionType: request.institutionType,
          status: "NEW",
          source: "STOREFRONT",
          requiredBy: request.requiredBy,
          deliverTo: request.deliverTo,
          notes: request.notes,
          specialRequest: request.specialRequest,
          items: { create: items },
        },
        select: { id: true, reference: true, accessToken: true },
      });

      // The timeline starts where the request does, and the actor is the
      // customer rather than a staff member — the console's timeline shows
      // both, and "Submitted by us" would be a small lie on every request.
      await tx.quotationEvent.create({
        data: {
          requestId: row.id,
          kind: "SUBMITTED",
          summary: `Request submitted from the storefront with ${items.length} ${
            items.length === 1 ? "line" : "lines"
          }${request.specialRequest ? " and a description" : ""}.`,
          actorKind: "CUSTOMER",
          actorId: customer?.customerId ?? "",
          actorName: request.contactName,
        },
      });

      return row;
    });

    // If they told us something about themselves that we did not have, keep
    // it: the next request should not ask again. Never overwrites a value
    // they have already set.
    if (customer && (request.institutionType || request.contactPhone)) {
      await medicalDb.medicalCustomer
        .update({
          where: { id: customer.customerId },
          data: {
            ...(request.institutionType && customer.customerType === "INDIVIDUAL"
              ? { customerType: request.institutionType }
              : {}),
            ...(request.contactPhone && !customer.phone ? { phone: request.contactPhone } : {}),
          },
        })
        .catch(() => {
          // Their request is written. Failing to improve their profile is not
          // a reason to tell them the request did not arrive.
        });
    }

    return { ok: true, reference: created.reference, token: created.accessToken };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[medical] request failed:", error);
    return {
      ok: false,
      error: "That could not be sent. Try again, or ring us on the number in the header.",
    };
  }
}
