# Nickimart Medical — Phase 1 inspection

What exists in this repository, what the medical application reuses, and where
the boundaries are. Written before any medical code, from reading the retail and
bundle sources rather than guessing at them.

## 1. The precedent this follows

Nickimart already runs two businesses out of one repository:

| | Retail mall | Data bundles |
|---|---|---|
| Schema | `prisma/schema.prisma` | `prisma/data/schema.prisma` |
| Client output | default (`@prisma/client`) | `node_modules/.prisma/data-client` |
| Connection | `DATABASE_URL` | `DATA_DATABASE_URL`, falling back to `DATABASE_URL` |
| Entry point | `src/lib/prisma.ts` | `src/lib/data-db.ts` |
| Domain code | `src/lib/*`, `src/lib/retail/*` | `src/lib/data-bundles/*` |
| Routes | `/`, `/admin` | `/data-bundles`, `/admin/data`, `/agent` |

The comment at the head of `prisma/data/schema.prisma` states the reason: the
two businesses fail, grow and get restored independently, and a bundle price
edit should never contend with a Black Friday checkout. Identity is the single
thing that crosses — `DataAgent.userId` holds a `User.id` from the mall database
as a plain indexed column, not a foreign key, because Postgres cannot enforce a
reference into another database. `src/lib/data-bundles/user-link.ts` joins the
two sides in one round trip per page of rows.

**Medical is the third instance of exactly this pattern.** Nothing new is
invented for it.

| | Medical |
|---|---|
| Schema | `prisma/medical/schema.prisma` |
| Client output | `node_modules/.prisma/medical-client` |
| Connection | `MEDICAL_DATABASE_URL`, falling back to `DATABASE_URL` |
| Entry point | `src/lib/medical/db.ts` |
| Domain code | `src/lib/medical/*` |
| Routes | `/medicals`, `/medicals/admin`, `/medicals/redistributor` |

Cross-database identity: `MedicalCustomer.userId` and `MedicalStaff.userId` hold
a retail `User.id` as a plain indexed column, joined through
`src/lib/medical/user-link.ts`, which is modelled directly on the bundle one.

## 2. Reused as-is

These are imported, not copied. A fix to any of them fixes all three businesses.

| Module | What it gives medical |
|---|---|
| `src/lib/auth.ts`, `auth.config.ts`, `session.ts` | Sign-in, session, `requireUser`. One Nickimart account across all three businesses. |
| `src/lib/cn.ts` | Class merging. |
| `src/components/ui/motion.tsx` | `ActionLink`, `SubmitButton`, `BusyButton`, `LinkSpinner`, `RouteProgress`, `Skeleton`. The press/pending feel. |
| `src/lib/payments.ts` | Paystack charge, verify, webhook signature. Already multi-account (`"retail"` / `"data"`); medical adds a third account rather than a second integration. |
| `src/lib/payment-routing.ts` | Which business a charge belongs to, and who may settle it. Pure and tested. |
| `src/lib/rate-limit.ts` | Request throttling on public endpoints. |
| `src/lib/email-sender.ts` | Transactional email. |
| `src/lib/db-errors.ts` | Prisma error narrowing. |
| `src/lib/xlsx.ts`, `exports.ts` | Table exports. |
| `src/lib/phone.ts`, `countries.ts` | Normalisation and country data. |

## 3. Reused as a pattern, rebuilt in the medical palette

These are read closely and reimplemented under `src/components/medical/` because
they are welded to retail brand tokens (`niki-orange`, `niki-surface`) and to
retail route shapes. The interaction, the markup rhythm and the reasoning carry
over unchanged; only the colour and the labels differ.

| Retail source | Medical counterpart | What specifically carries over |
|---|---|---|
| `components/admin/AdminShell.tsx` | `medical/admin/MedicalAdminShell.tsx` | Collapsible left sidebar, `useSyncExternalStore` over `localStorage` so the server render never flips, deepest-match active rule, grouped nav sections. |
| `components/affiliate/ConsoleTable.tsx` + `admin/TablePager.tsx` | `medical/console/MedicalTable.tsx` | One table component for every console screen: the card, the rounded header row, the `th`/`td` class exports, the empty state, the pager strip underneath. |
| `components/admin/FilterChip.tsx` | `medical/console/FilterChip.tsx` | Query-string-driven filter chips. |
| `components/dashboard/StatCard.tsx` | `medical/console/StatCard.tsx` | Metric tile that becomes a link to its own source when given an `href`. |
| `components/admin/charts/TrendChart.tsx` | `medical/charts/TrendChart.tsx` | Hand-drawn SVG area chart. No chart library anywhere in this repo and none is added. Keeps: every stretch of the window is a point including the ones that traded nothing; `preserveAspectRatio="none"` with `vector-effect` so strokes keep real thickness; end markers in an HTML overlay because a circle in a stretched viewBox is an ellipse; full-height hit bands per column; tooltip that flips below the mark near the top and `clamp`s inside the plot; the hovered index derived rather than stored so a shortened series cannot index past its end. |
| `components/admin/charts/BarList.tsx`, `StatusBar.tsx` | `medical/charts/*` | Ranked bars and status distribution. |
| `components/affiliate/FlyerCanvasEditor.tsx`, `DesignControls.tsx`, `WatermarkDesigner.tsx`, `share-canvas.ts` | `medical/documents/TemplateDesigner.tsx` | The quotation and proforma template editor. Live preview beside grouped controls, saved named designs, reset-to-default, server-stored design JSON. |
| `components/admin/ProductForm.tsx`, `ProductImagesField.tsx`, `KeyAttributesField.tsx` | `medical/admin/ProductForm.tsx` | Multi-section product editor, image gallery field, repeating attribute rows. |
| `lib/affiliate-attribution.ts`, `affiliate-commission.ts`, `affiliate-ledger.ts`, `affiliate-policy.ts`, `affiliate-team-rules.ts` | `lib/medical/redistributor/*` | Referral capture and attribution window, commission computation with funding source, append-only ledger, eligibility policy (payment, cancellation, return, refund), team structure. The retail versions have unit tests; the medical ones get the same. |
| `lib/checkout-actions.ts`, `cart-bill.ts`, `cart-pricing.ts`, `stock.ts` | `lib/medical/checkout/*` | Cart totalling, promo application, order creation, stock decrement under transaction. |
| `app/globals.css` | medical token block in the same file | The `niki-press` / `niki-lift` / `niki-focus` / `stagger-children` / skeleton utilities are shared verbatim. Medical adds its own colour variables beside the retail ones; it redefines none of them. |

## 4. Built new

No equivalent exists in the repository.

- Quotation request → quotation version → proforma invoice → sales order chain,
  with immutable issued versions and an audit trail.
- Decimal-safe money (`lib/medical/money.ts`). Retail stores money as `Float`.
  Medical stores `Decimal(14,2)` and does every calculation in integer pesewas.
- Configurable instalment plans, schedule generation, and a payment ledger.
- Supplier sourcing: supplier quotations, purchase orders, goods received,
  landed-cost estimates, payables, product cost history.
- Batch and expiry tracking, stock reservation separate from deduction.
- Double-entry-style financial transaction ledger.
- PDF generation for quotations and proforma invoices.
- Per-product purchasing mode (checkout / quotation / both).

## 5. Boundaries that must hold

1. **No retail or bundle table is read or written by medical code.** The only
   permitted cross-database read is the retail `User` row behind a medical
   customer or staff member, through `lib/medical/user-link.ts`.
2. **No existing migration is edited.** Medical migrations live in
   `prisma/medical/migrations/` and run against `MEDICAL_DATABASE_URL`.
3. **Supplier identity, purchase cost, sourcing route and landed-cost records
   never leave the admin boundary.** Customer- and redistributor-facing
   selections list their columns explicitly; no query returns a whole product
   row to a public surface.
4. **Shared files changed:** exactly three, each additively.
   - `src/components/layout/ChromeGate.tsx` — `/medicals` added to the prefixes
     that suppress retail chrome.
   - `src/app/globals.css` — a medical token block appended.
   - `package.json`, `scripts/migrate.mjs` — the third schema added to generate
     and deploy.
   Nothing else in `src/app`, `src/lib` or `src/components` outside
   `medical/` is modified.

## 6. Open questions carried forward

- **Regulatory.** Instalment and credit terms are a consumer-credit offering
  under Ghanaian law. The schema and admin support them and the storefront does
  not advertise them until this is cleared. Flagged, not assumed.
- **Paystack account.** `MEDICAL_PAYSTACK_SECRET_KEY` is read with a fallback to
  the retail key, so the business can run on one account and split later by
  setting one variable — the same migration path the bundle/retail split used.
- **Domain.** `medicals.nickimart.com` serves `/medicals`. Either a second
  Vercel project on this repository with a rewrite, or a host rewrite in
  `next.config.ts`. Not yet wired; the routes work at the path today.
- **Tax.** No VAT/NHIL/GETFund treatment is implemented. Quotation and proforma
  documents carry a configurable charge line, which is where it will go once the
  business states its position.

---

## 7. The extension: tenders and internal procurement

Added after the first two phases, on the same rule: inspect first, extend, break
nothing. Nothing in sections 1–6 was rewritten; the twelve new tables, three new
columns and ten console screens below sit beside what was already there.

### What was reused rather than rebuilt

- **The console itself.** `MedicalAdminShell`, `ConsoleTable`, `ConsoleHeader`,
  `StatCard`, `ConsoleFilters`, `ConsolePager`, `Field`, `ActionForm`,
  `StatusBadge`. Ten new screens, no new layout primitive.
- **The role table.** `SECTION_ACCESS` already had rows for `sourcing`,
  `supplier-quotes`, `customer-orders` and `customer-purchase-orders`; the
  screens were built to the access that was already declared, not the reverse.
- **The money module.** Every figure on the new screens goes through
  `money.ts` — `toPesewas` on the way in, `formatPesewas` on the way out.
- **The landed-cost module.** `compareOffers` and `landedCostOf` already existed
  and were tested. The extension gave them something to read.
- **Stock, ledger, numbering, audit.** `reserveStock`, `postTransaction`,
  `nextReference` and `recordAudit` are called by the new actions unchanged.

### What the extension had to add, and why

| Addition | Why it could not be folded into something existing |
|---|---|
| `CustomerPurchaseOrder` (+ items) | A purchase order a hospital issues to us and one we issue to a supplier are different documents with opposite obligations. Sharing `PurchaseOrder` would make every total ambiguous. |
| `TenderSubmissionItem.outcome` | A tender returns a different answer per line. One status on the tender cannot say "won three of five, part-awarded on a fourth". |
| `ApprovedProduct` | An award is authorisation to supply at a price until a date, with a quantity ceiling. It is not an order and not a sale, and it has to be drawn down against. |
| `SourcingRequest` (+ items) | The bridge. What has to be procured is not what was sold: four customers short of one reagent is one supplier order, and consolidating them needs a record a buyer can see all of them in. Items carry `salesOrderItemId`, so a short delivery traces to the customer it was for. |
| `SupplierInvoiceItem` | Three-way match needs the invoiced line beside the ordered and the accepted line. |
| Six charge columns on `SupplierQuote` | Added during this phase, after the comparison screen was built: without freight, duty rate and clearing, a "landed cost comparison" is a currency conversion wearing the wrong name. |
| `PurchaseOrder.supplierQuoteId` | So the order can say which quotation it was priced from. A comparison nobody can trace to the order it produced is a screen, not a record. |

### Invariants the extension is held to

Asserted by `npm run medical:check`, which runs the whole chain against a real
Postgres and currently makes 51 assertions:

- A tender with mixed per-line outcomes reports `PARTIALLY_AWARDED`, not won or
  lost.
- An award creates register entries and **zero** sales orders and **zero**
  revenue.
- A customer purchase order is a separate record; accepting it marks nothing
  paid and nothing dispatched.
- Reserving more than exists is refused; a second order cannot reserve the same
  stock.
- The cheapest unit price and the cheapest landed cost are different suppliers,
  and the comparison states what choosing on unit price would have cost.
- An unanswered request for prices is not ranked at zero, and an import quoted
  with no freight or duty is not reported as costed.
- The purchase order records the quotation it was priced from, at that
  quotation's prices.
- Only accepted quantities enter stock, at landed cost; the movement log
  explains the counter.
- Revenue is posted once, on delivery; over-billing is caught and priced; the
  invoice is unpayable until the variance is accepted.

### Shared files changed by the extension

Still additive, and still few:

- `src/lib/medical/procurement/actions.ts` — `createPurchaseOrder` learned to
  price from a chosen supplier quotation. Existing behaviour unchanged when no
  quotation is passed.
- `src/lib/medical/procurement/queries.ts` — `compareQuotesForSourcing` now
  reads the charge columns instead of passing zeros, and drops unpriced
  quotations from the ranking.
- `src/components/medical/console/MedicalAdminShell.tsx` — nav entries for the
  new sections.
- `src/app/globals.css`, `DESIGN.md` — `--color-medi-warning` darkened from
  `0.52` to clear 4.5:1 at badge size. Measured, not guessed.
- `db/medical-migrations/0003_quote_costs_and_order_link.sql` — the only new
  migration. Purely additive, re-runnable, verified against a schema-to-schema
  diff.

### The role rename

The top medical role was `OWNER` and is now `ADMIN`. Migration 0003 carries the
`UPDATE` for any row that already said `OWNER`, because the role is a validated
string: a staff row the validator no longer recognises is a person the console
turns away. `ADMIN` is spelled the same as retail's top role and means something
different — a medical role is carried by a row in `medical_staff`, so a retail
administrator with no such row reaches nothing here.

### Still not built

Quotations, inventory, products, staff, settings and the audit log have tables
behind them and no screens. They are absent from the navigation and their
figures on the overview are reported without links, because a tile that opens a
404 teaches people the console cannot be trusted. Customer-side dispatch,
invoicing and payment are likewise recorded by the modules and exercised by
`medical:check`, but have no console screen yet.
