# Nickimart Medical — unresolved regulatory and commercial questions

Things the software supports and the business has not yet decided or cleared.
Each is switched **off** in the seed, so none of them can reach a customer by
accident. This file is the record of why, and what has to happen before any of
them is switched on.

## 1. Instalment and credit terms — OFF

`PaymentPlan` rows for 3, 6 and 12 months are seeded with `isActive = false`,
and the setting `instalments.enabled` is `false`. The storefront does not
mention instalments anywhere.

**Why.** Offering goods now against payment over an approved period is a
consumer-credit offering. In Ghana that touches the Borrowers and Lenders Act,
2020 (Act 1052), and, where the arrangement is structured through a financial
institution, Bank of Ghana licensing. Charging for late payment, and charging
an administrative fee on a credit arrangement, are separately constrained.

**Before enabling.** Confirm with counsel: whether a trade-credit arrangement
between a supplier and an institutional buyer falls inside Act 1052 at all;
what has to be disclosed, and in what form, before a customer accepts; whether
the uplift must be expressed as an interest rate rather than a price increase;
what may lawfully be charged on a late instalment; and what the position is
for an individual buyer as against an institution.

The schema supports whichever answer comes back — `upliftRate`, `lateFeeRate`,
`adminFee`, `graceDays`, `institutionsOnly` and `requiresCreditApproval` are
all per-plan columns. Nothing is compiled in.

## 2. Tax treatment — NOT IMPLEMENTED

`tax.enabled` is `false` and `tax.rate` is `0`. Quotations and proforma
invoices carry a tax line that renders only when a rate is set, and **no rate
is assumed anywhere in the code**.

**Before enabling.** The business states its position on VAT, NHIL, GETFund
and the COVID-19 Health Recovery Levy, and whether any part of the catalogue is
zero-rated or exempt (some medical supplies are). Note that these are not a
single percentage: NHIL/GETFund/COVID levies are charged on the value and are
not themselves subject to VAT, so "one tax rate" will not express it. The
`taxLabel` / `taxRate` / `taxAmount` columns on `Quotation` are a placeholder
for a single line and will need extending to a list once the position is known.

## 3. Restricted products — PARTIALLY HANDLED

`MedicalProduct.restrictedSale` forces a product to quotation-only and shows
the customer a note, and `restrictionNote` says what will be asked for. The HIV
rapid test in the seed is marked this way.

**Not implemented.** There is no verification workflow: nothing records that a
facility licence was seen, by whom, or when. Until there is, a restricted line
is gated by a human reading the quotation request, which is a process control
and not a system control.

**Before scale.** Confirm which product classes require a licensed purchaser
under FDA Ghana rules, whether evidence must be retained and for how long, and
whether any item in the catalogue requires an import permit that affects what
may be quoted.

## 4. Patient data — OUT OF SCOPE BY DESIGN

This is a procurement platform. No schema here holds patient information, test
results or anything clinical, and none should ever be added. A customer is an
institution and a person who buys on its behalf.

If a future feature appears to need clinical data — an analyser integration, a
QC record, a result-linked reorder — that is a different system with a
different legal footing, and the answer here is no.

## 5. Medical device and import compliance — NOT MODELLED

The catalogue carries no field for an FDA Ghana registration number, a CE mark,
an ISO 13485 reference or an import permit. Nothing on the storefront claims
any certification, which is why its absence is currently safe.

**Before claiming anything.** If the business wants to display registration or
certification status, those become columns with evidence behind them and an
administrator who is accountable for each value — not free text in a
description. An unverified certification claim on a medical device is worse
than none.

## 6. Payment account — PENDING A DECISION

`MEDICAL_PAYSTACK_SECRET_KEY` falls back to the retail key when unset, so the
medical business can take payments from day one on the existing account and be
split later by setting one variable. That mirrors the retail/bundle split.

**Decide.** Whether medical settles into its own Paystack account. Until it
does, medical revenue and retail revenue arrive in one payout that nobody can
split afterwards — which is the exact problem `src/lib/payments.ts` documents
for the mall and the bundle business.

## 7. Delivery and cold chain — STATED, NOT GUARANTEED

Lead times on the storefront come from `leadTimeMinDays` / `leadTimeMaxDays`
and are described as estimates. Cold-chain products carry a note that they ship
in insulated packaging and only to an address that can receive them.

**Not implemented.** There is no temperature-excursion record, no carrier
integration, and no check that a delivery address can in fact receive a
cold-chain item — the note tells the customer, and a person confirms it. Before
promising a cold chain in writing, the business needs the packaging validated
and a record of what left the store and when.

---

*Nothing in this file is legal advice. It is a list of questions for somebody
qualified to answer, written by the people who built the software, so that the
switches above are not flipped by somebody who did not know they were here.*
