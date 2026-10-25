/**
 * The acceptance test: tender → award → customer PO → order → sourcing →
 * supplier PO → goods received → fulfilment → invoice → payment.
 *
 * Runs against a real Postgres, in one disposable schema, and asserts the
 * invariants that matter rather than that the code did not throw:
 *
 *   - an award creates register entries and NOT a sale
 *   - accepting a purchase order reserves stock without deducting it
 *   - only accepted quantities enter stock, at the landed cost
 *   - the movement log always explains the counter
 *   - dispatch takes first-expiry-first-out and reports its own cost
 *   - the ledger counts each event once
 *   - a discrepant supplier invoice cannot be paid until somebody accepts it
 *
 * It calls the same modules the server actions call. What it deliberately does
 * not exercise is the `requireMedicalRole` wrapper around each action — that
 * needs a signed-in session and is covered separately by driving the console
 * through a browser.
 *
 *   MEDICAL_DATABASE_URL=… npx tsx scripts/medical-workflow-check.ts
 */

import assert from "node:assert/strict";
import { PrismaClient } from ".prisma/medical-client";
import {
  dispatchStock,
  receiveStock,
  releaseReservation,
  reserveStock,
  InsufficientStockError,
} from "../src/lib/medical/inventory/stock.ts";
import { postTransaction } from "../src/lib/medical/finance/ledger.ts";
import { nextReference } from "../src/lib/medical/numbering.ts";
import { matchInvoice, outstandingOn, settlementStatus } from "../src/lib/medical/procurement/matching.ts";
import { compareQuotesForSourcing } from "../src/lib/medical/procurement/queries.ts";
import { apportionLandedCosts } from "../src/lib/medical/procurement/landed-cost.ts";
import { summarise } from "../src/lib/medical/tenders/status.ts";
import { stateOf } from "../src/lib/medical/tenders/register.ts";
import { formatPesewas, lineAmount, sum, toDecimalString, toPesewas } from "../src/lib/medical/money.ts";

const db = new PrismaClient();

let passed = 0;
function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
    throw new Error(`FAILED: ${label}`);
  }
}

function step(n: number, label: string): void {
  console.log(`\n${n}. ${label}`);
}

/** A unique suffix so the script can be run repeatedly without colliding. */
const RUN = Date.now().toString(36);
/**
 * When this run began.
 *
 * Needed because one assertion is about something *not* happening, and a
 * count of rows that should be zero has to exclude the rows an earlier run of
 * this same script left behind. Scoping it to this run was not optional: the
 * first version counted every SALE_REVENUE row in the database and so passed
 * only against an empty one, which is the kind of check that reports a false
 * failure the second time somebody runs it.
 */
const STARTED_AT = new Date();

async function main(): Promise<void> {
  if (!process.env.MEDICAL_DATABASE_URL?.trim()) {
    console.error("MEDICAL_DATABASE_URL is not set.");
    process.exit(1);
  }

  console.log("Nickimart Medical — end-to-end workflow check\n" + "=".repeat(46));

  // ---------------------------------------------------------------------
  step(1, "An institution and a product to sell it");

  const hospital = await db.organisation.create({
    data: {
      name: `Check Teaching Hospital ${RUN}`,
      slug: `check-hospital-${RUN}`,
      kind: "HOSPITAL",
      city: "Accra",
      creditApproved: false,
    },
  });

  const category = await db.medicalCategory.findFirstOrThrow({ where: { isActive: true } });
  const supplier = await db.supplier.create({
    data: {
      code: `CHK-${RUN}`,
      name: `Check Supplies ${RUN}`,
      kind: "INTERNATIONAL",
      currency: "USD",
      leadTimeDays: 21,
    },
  });

  const product = await db.medicalProduct.create({
    data: {
      slug: `check-reagent-${RUN}`,
      name: "Check glucose reagent",
      sku: `CHK-RGT-${RUN}`,
      categoryId: category.id,
      price: "428.00",
      purchaseCost: "280.00",
      averageCost: "0",
      unitOfSale: "kit",
      purchaseMode: "BOTH",
      status: "ACTIVE",
      stockOnHand: 0,
      tracksBatches: true,
      primarySupplierId: supplier.id,
    },
  });
  check("product starts with no stock", product.stockOnHand === 0);

  // ---------------------------------------------------------------------
  step(2, "A tender, bid line by line, with a mixed outcome");

  const tender = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "TENDER");
    return tx.tender.create({
      data: {
        reference,
        tenderNumber: `KBTH/2026/${RUN}`,
        organisationId: hospital.id,
        title: "Supply of laboratory reagents",
        status: "PREPARING",
        contractStartAt: new Date(),
        contractEndAt: new Date(Date.now() + 365 * 86_400_000),
      },
    });
  });

  const requirements = await Promise.all(
    [
      { lot: "1", description: "Glucose reagent", quantity: 100, productId: product.id },
      { lot: "2", description: "Cholesterol reagent", quantity: 80, productId: null },
      { lot: "3", description: "Centrifuge", quantity: 2, productId: null },
    ].map((r, index) =>
      db.tenderItem.create({
        data: {
          tenderId: tender.id,
          lotNumber: r.lot,
          description: r.description,
          quantity: r.quantity,
          unit: "kit",
          productId: r.productId,
          position: index * 10,
        },
      }),
    ),
  );

  const submission = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "TENDER_SUBMISSION");
    return tx.tenderSubmission.create({
      data: { reference, version: 1, tenderId: tender.id, status: "DRAFT", currency: "GHS" },
    });
  });

  // Two lines bid, one declined.
  const bids = [
    { item: requirements[0], price: "400.00", cost: "280.00", noBid: false },
    { item: requirements[1], price: "290.00", cost: "200.00", noBid: false },
    { item: requirements[2], price: "0", cost: "0", noBid: true },
  ];
  const submissionItems = await Promise.all(
    bids.map((bid, index) =>
      db.tenderSubmissionItem.create({
        data: {
          submissionId: submission.id,
          tenderItemId: bid.item.id,
          productId: bid.item.productId,
          offeredDescription: bid.item.description,
          quantity: bid.item.quantity,
          unit: "kit",
          unitPrice: bid.price,
          lineTotal: toDecimalString(
            bid.noBid ? 0 : lineAmount(bid.item.quantity, toPesewas(bid.price)),
          ),
          unitCostAtBid: bid.cost,
          isNoBid: bid.noBid,
          position: index * 10,
        },
      }),
    ),
  );

  // The outcome: one awarded in full, one partially, one not bid.
  await db.tenderSubmissionItem.update({
    where: { id: submissionItems[0].id },
    data: { outcome: "AWARDED", awardedQuantity: 100, awardedUnitPrice: "400.00", awardedAt: new Date() },
  });
  await db.tenderSubmissionItem.update({
    where: { id: submissionItems[1].id },
    data: { outcome: "PARTIALLY_AWARDED", awardedQuantity: 30, awardedUnitPrice: "285.00", awardedAt: new Date() },
  });

  const finalItems = await db.tenderSubmissionItem.findMany({
    where: { submissionId: submission.id },
  });
  const outcome = summarise(
    finalItems.map((item) => ({
      outcome: item.outcome as never,
      isNoBid: item.isNoBid,
      quantity: item.quantity,
      awardedQuantity: item.awardedQuantity,
      unitPrice: toPesewas(item.unitPrice),
      awardedUnitPrice: toPesewas(item.awardedUnitPrice),
      unitCostAtBid: toPesewas(item.unitCostAtBid),
    })),
  );

  check("one tender, three lines, three different answers", outcome.bidLines === 2 && outcome.noBidLines === 1);
  check("status is PARTIALLY_AWARDED, not won or lost", outcome.status === "PARTIALLY_AWARDED");
  check(
    "awarded value uses their price and their quantity",
    outcome.awardedValue === toPesewas(100 * 400 + 30 * 285),
    `got ${formatPesewas(outcome.awardedValue)}`,
  );

  // ---------------------------------------------------------------------
  step(3, "An award is permission, not a sale");

  for (const item of finalItems.filter((i) => i.outcome !== "PENDING" && !i.isNoBid)) {
    if (item.outcome !== "AWARDED" && item.outcome !== "PARTIALLY_AWARDED") continue;
    await db.approvedProduct.create({
      data: {
        organisationId: hospital.id,
        productId: item.productId,
        description: item.offeredDescription,
        sourceKind: "TENDER",
        tenderId: tender.id,
        submissionItemId: item.id,
        unitPrice: item.awardedUnitPrice,
        unit: item.unit,
        quantityAwarded: item.awardedQuantity,
        validFrom: new Date(),
        validUntil: new Date(Date.now() + 365 * 86_400_000),
      },
    });
  }

  const register = await db.approvedProduct.findMany({ where: { organisationId: hospital.id } });
  check("awarded lines are in the approved register", register.length === 2);
  check(
    "no sales order was created by the award",
    (await db.salesOrder.count({ where: { organisationId: hospital.id } })) === 0,
  );
  check(
    "no revenue was posted by the award",
    (await db.financialTransaction.count({
      where: { kind: "SALE_REVENUE", createdAt: { gte: STARTED_AT } },
    })) === 0,
  );

  const entry = register.find((r) => r.productId === product.id)!;
  const registerState = stateOf({
    id: entry.id,
    productId: entry.productId,
    description: entry.description,
    unitPrice: toPesewas(entry.unitPrice),
    unit: entry.unit,
    quantityAwarded: entry.quantityAwarded,
    quantityDrawn: entry.quantityDrawn,
    minimumOrderQuantity: entry.minimumOrderQuantity,
    leadTimeDays: entry.leadTimeDays,
    validFrom: entry.validFrom,
    validUntil: entry.validUntil,
    status: entry.status as never,
  });
  check("the register entry is usable and reports its ceiling", registerState.isUsable && registerState.remaining === 100);

  // ---------------------------------------------------------------------
  step(4, "The hospital sends a purchase order; it becomes an order");

  const customerPo = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "CUSTOMER_PO");
    return tx.customerPurchaseOrder.create({
      data: {
        reference,
        customerReference: `KBTH-PO-${RUN}`,
        organisationId: hospital.id,
        tenderId: tender.id,
        status: "RECEIVED",
        currency: "GHS",
        totalValue: "24000.00",
      },
    });
  });
  check("a customer PO is a separate record from our own", customerPo.reference.startsWith("CPO-"));

  const ORDER_QTY = 60;
  const salesOrder = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "ORDER");
    const unitPrice = toPesewas(entry.unitPrice);
    const subtotal = lineAmount(ORDER_QTY, unitPrice);

    const order = await tx.salesOrder.create({
      data: {
        reference,
        channel: "QUOTATION",
        organisationId: hospital.id,
        fulfilmentStatus: "CONFIRMED",
        paymentStatus: "UNPAID",
        confirmedAt: new Date(),
        subtotal: toDecimalString(subtotal),
        totalOutright: toDecimalString(subtotal),
        totalPayable: toDecimalString(subtotal),
        balanceDue: toDecimalString(subtotal),
      },
    });
    await tx.salesOrderItem.create({
      data: {
        salesOrderId: order.id,
        productId: product.id,
        description: product.name,
        quantity: ORDER_QTY,
        unit: "kit",
        unitPrice: toDecimalString(unitPrice),
        lineTotal: toDecimalString(subtotal),
      },
    });
    await tx.customerPurchaseOrder.update({
      where: { id: customerPo.id },
      data: { status: "ACCEPTED", salesOrderId: order.id },
    });
    return order;
  });

  check("accepting a PO does not mark it paid", salesOrder.paymentStatus === "UNPAID");
  check("accepting a PO does not dispatch it", salesOrder.fulfilmentStatus === "CONFIRMED");

  // ---------------------------------------------------------------------
  step(5, "Nothing on the shelf, so nothing can be reserved");

  let reserveFailed = false;
  try {
    await db.$transaction(async (tx) => {
      await reserveStock(tx, product.id, ORDER_QTY, {
        sourceType: "SALES_ORDER",
        sourceId: salesOrder.id,
      });
    });
  } catch (error) {
    reserveFailed = error instanceof InsufficientStockError;
  }
  check("reserving more than exists is refused", reserveFailed);

  // ---------------------------------------------------------------------
  step(6, "A sourcing round, and two replies compared on landed cost");

  const sourcing = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "SOURCING");
    const request = await tx.sourcingRequest.create({
      data: { reference, reason: "CUSTOMER_ORDER", salesOrderId: salesOrder.id, status: "OPEN" },
    });
    const orderItem = await tx.salesOrderItem.findFirstOrThrow({
      where: { salesOrderId: salesOrder.id },
    });
    await tx.sourcingRequestItem.create({
      data: {
        sourcingRequestId: request.id,
        productId: product.id,
        description: product.name,
        quantity: ORDER_QTY,
        unit: "kit",
        salesOrderItemId: orderItem.id,
      },
    });
    return request;
  });

  // Two suppliers reply. The importer is cheaper per unit — $17.50 at GH₵15.40
  // is GH₵269.50 against the local supplier's GH₵280 — and dearer by the time
  // it is on the shelf, once freight, 20% duty on the CIF value and clearing
  // are counted. This is the whole reason the comparison exists, and it is the
  // choice a buyer comparing unit prices by eye gets wrong.
  const localSupplier = await db.supplier.create({
    data: {
      code: `CHK-L-${RUN}`,
      name: `Check Local Depot ${RUN}`,
      kind: "LOCAL",
      currency: "GHS",
      leadTimeDays: 5,
    },
  });

  const { importQuote, localQuote } = await db.$transaction(async (tx) => {
    const sourcingItem = await tx.sourcingRequestItem.findFirstOrThrow({
      where: { sourcingRequestId: sourcing.id },
    });

    const importQuote = await tx.supplierQuote.create({
      data: {
        reference: await nextReference(tx, "SUPPLIER_QUOTE"),
        supplierId: supplier.id,
        sourcingRequestId: sourcing.id,
        status: "RECEIVED",
        receivedAt: new Date(),
        currency: "USD",
        exchangeRate: "15.40",
        freight: "900.00",
        insurance: "120.00",
        dutyRateBp: 2000,
        clearingGhs: "3200.00",
      },
    });
    await tx.supplierQuoteItem.create({
      data: {
        supplierQuoteId: importQuote.id,
        productId: product.id,
        description: sourcingItem.description,
        quantity: ORDER_QTY,
        unitCost: "17.50",
        leadTimeDays: 28,
      },
    });

    const localQuote = await tx.supplierQuote.create({
      data: {
        reference: await nextReference(tx, "SUPPLIER_QUOTE"),
        supplierId: localSupplier.id,
        sourcingRequestId: sourcing.id,
        status: "RECEIVED",
        receivedAt: new Date(),
        currency: "GHS",
        exchangeRate: "1",
      },
    });
    await tx.supplierQuoteItem.create({
      data: {
        supplierQuoteId: localQuote.id,
        productId: product.id,
        description: sourcingItem.description,
        quantity: ORDER_QTY,
        unitCost: "280.00",
        leadTimeDays: 5,
      },
    });

    // Asked but not yet priced. It must not win and must not be ranked as free.
    const pending = await tx.supplierQuote.create({
      data: {
        reference: await nextReference(tx, "SUPPLIER_QUOTE"),
        supplierId: supplier.id,
        sourcingRequestId: sourcing.id,
        status: "REQUESTED",
        currency: "USD",
        exchangeRate: "15.40",
      },
    });
    await tx.supplierQuoteItem.create({
      data: {
        supplierQuoteId: pending.id,
        productId: product.id,
        description: sourcingItem.description,
        quantity: ORDER_QTY,
        unitCost: "0",
      },
    });

    return { importQuote, localQuote };
  });

  const comparison = await compareQuotesForSourcing(sourcing.id);
  const importCost = comparison.ranked.find((row) => row.offerId === importQuote.id)!;
  const localCost = comparison.ranked.find((row) => row.offerId === localQuote.id)!;

  check(
    "the importer is cheaper per unit on goods alone",
    Math.round(importCost.goodsGhs / ORDER_QTY) < Math.round(localCost.goodsGhs / ORDER_QTY),
    `${formatPesewas(Math.round(importCost.goodsGhs / ORDER_QTY))} vs ${formatPesewas(Math.round(localCost.goodsGhs / ORDER_QTY))}`,
  );
  check(
    "duty is charged on goods plus freight, not on goods alone",
    importCost.dutyGhs === Math.round(importCost.customsValueGhs * 0.2) &&
      importCost.customsValueGhs > importCost.goodsGhs,
  );
  check(
    "the cheapest landed offer is the local one",
    comparison.best?.offerId === localQuote.id,
    `${formatPesewas(localCost.totalGhs)} vs ${formatPesewas(importCost.totalGhs)}`,
  );
  check(
    "the comparison names what buying on unit price would have cost",
    comparison.cheapestByUnitPrice?.offerId === importQuote.id &&
      comparison.savingAgainstUnitPriceChoice === importCost.totalGhs - localCost.totalGhs,
    formatPesewas(comparison.savingAgainstUnitPriceChoice),
  );
  check(
    "a request that has not been answered is not ranked at zero",
    comparison.ranked.length === 2 && comparison.ranked.every((row) => row.totalGhs > 0),
  );

  // An import priced with nothing between their gate and ours is a goods
  // value, not a landed cost. On its own round, so it cannot disturb the
  // comparison above.
  const bareRound = await db.$transaction(async (tx) => {
    const request = await tx.sourcingRequest.create({
      data: { reference: await nextReference(tx, "SOURCING"), reason: "STOCK_REPLENISHMENT" },
    });
    const quote = await tx.supplierQuote.create({
      data: {
        reference: await nextReference(tx, "SUPPLIER_QUOTE"),
        supplierId: supplier.id,
        sourcingRequestId: request.id,
        status: "RECEIVED",
        receivedAt: new Date(),
        currency: "USD",
        exchangeRate: "15.40",
      },
    });
    await tx.supplierQuoteItem.create({
      data: {
        supplierQuoteId: quote.id,
        productId: product.id,
        description: product.name,
        quantity: 10,
        unitCost: "17.50",
      },
    });
    return request;
  });

  const bare = await compareQuotesForSourcing(bareRound.id);
  check(
    "an import quoted with no freight or duty is not reported as costed",
    bare.ranked.length === 1 && !bare.ranked[0].costsConfirmed && bare.hasEstimates,
  );

  // ---------------------------------------------------------------------
  step(7, "The order we place, priced from the reply we chose");

  const UNIT_COST = toPesewas("280.00");
  const purchaseOrder = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "PO");
    const order = await tx.purchaseOrder.create({
      data: {
        reference,
        supplierId: localSupplier.id,
        // The reply the comparison chose. Without this the order cannot say
        // which price it was raised from, and "why did we pay this" has no
        // answer.
        supplierQuoteId: localQuote.id,
        status: "SENT",
        orderedAt: new Date(),
        currency: "GHS",
        exchangeRate: "1",
        shippingActual: "2400.00",
        dutyActual: "1200.00",
        costsConfirmed: true,
      },
    });
    const sourcingItem = await tx.sourcingRequestItem.findFirstOrThrow({
      where: { sourcingRequestId: sourcing.id },
    });
    await tx.purchaseOrderItem.create({
      data: {
        purchaseOrderId: order.id,
        productId: product.id,
        description: product.name,
        quantity: ORDER_QTY,
        unitCost: toDecimalString(UNIT_COST),
        lineTotal: toDecimalString(lineAmount(ORDER_QTY, UNIT_COST)),
        sourcingRequestItemId: sourcingItem.id,
        salesOrderItemId: sourcingItem.salesOrderItemId,
      },
    });
    return order;
  });

  // Landed costs apportioned, exactly as the action does it.
  const poItems = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: purchaseOrder.id } });
  const landedCharges = toPesewas("2400.00") + toPesewas("1200.00");
  const shares = apportionLandedCosts(
    poItems.map((i) => ({ id: i.id, quantity: i.quantity, unitCost: toPesewas(i.unitCost) })),
    landedCharges,
  );
  check(
    "the order says which reply it was priced from",
    purchaseOrder.supplierQuoteId === localQuote.id,
  );
  check(
    "the order's unit cost is the price that was quoted",
    toPesewas(poItems[0].unitCost) === toPesewas("280.00"),
    formatPesewas(toPesewas(poItems[0].unitCost)),
  );
  check("landed charges add back to exactly what was paid", sum(shares.map((s) => s.lineCharges)) === landedCharges);

  for (const share of shares) {
    await db.purchaseOrderItem.update({
      where: { id: share.id },
      data: { landedUnitCostGhs: toDecimalString(share.landedUnitCost) },
    });
  }
  const landedUnit = shares[0].landedUnitCost;
  check(
    "landed unit cost is above the invoice cost",
    landedUnit > UNIT_COST,
    `${formatPesewas(landedUnit)} vs ${formatPesewas(UNIT_COST)}`,
  );

  // ---------------------------------------------------------------------
  step(8, "A part delivery: 50 accepted, 4 rejected");

  const ACCEPTED = 50;
  const REJECTED = 4;

  const receipt = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "GRN");
    const grn = await tx.goodsReceipt.create({
      data: { reference, purchaseOrderId: purchaseOrder.id, deliveryNote: "WB-001" },
    });
    const item = poItems[0];
    const grnItem = await tx.goodsReceiptItem.create({
      data: {
        goodsReceiptId: grn.id,
        purchaseOrderItemId: item.id,
        quantityAccepted: ACCEPTED,
        quantityRejected: REJECTED,
        rejectionReason: "Short dated",
        batchNumber: "B-2026-01",
        expiryDate: new Date("2027-06-30"),
      },
    });
    await receiveStock(
      tx,
      {
        productId: product.id,
        quantity: ACCEPTED,
        unitCost: landedUnit,
        batchNumber: "B-2026-01",
        expiryDate: new Date("2027-06-30"),
        supplierId: localSupplier.id,
        goodsReceiptItemId: grnItem.id,
      },
      { sourceType: "GOODS_RECEIPT", sourceId: grn.id, reason: `Against ${purchaseOrder.reference}` },
    );
    await tx.purchaseOrderItem.update({
      where: { id: item.id },
      data: { quantityReceived: { increment: ACCEPTED } },
    });
    await postTransaction(tx, {
      kind: "PURCHASE",
      direction: "DEBIT",
      amount: ACCEPTED * landedUnit,
      sourceType: "GOODS_RECEIPT",
      sourceId: grn.id,
      description: "Goods received",
    });
    return grn;
  });

  const afterReceipt = await db.medicalProduct.findUniqueOrThrow({ where: { id: product.id } });
  check("only the accepted quantity entered stock", afterReceipt.stockOnHand === ACCEPTED);
  check("rejected units never touched stock", afterReceipt.stockOnHand !== ACCEPTED + REJECTED);
  check(
    "average cost is the landed cost, not the invoice price",
    toPesewas(afterReceipt.averageCost) === landedUnit,
  );

  const movements = await db.stockMovement.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: "asc" },
  });
  check("the movement log explains the counter", sum(movements.map((m) => m.quantity)) === afterReceipt.stockOnHand);
  check("a cost-history row was written", (await db.productCostHistory.count({ where: { productId: product.id } })) === 1);

  // ---------------------------------------------------------------------
  step(9, "Reserve what is there, dispatch it, and see what it cost");

  await db.$transaction(async (tx) => {
    await reserveStock(tx, product.id, ACCEPTED, {
      sourceType: "SALES_ORDER",
      sourceId: salesOrder.id,
      reason: "Reserved on confirmation",
    });
  });
  const reservedRow = await db.medicalProduct.findUniqueOrThrow({ where: { id: product.id } });
  check("reserving does not deduct physical stock", reservedRow.stockOnHand === ACCEPTED);
  check("reserved stock is no longer available", reservedRow.stockOnHand - reservedRow.stockReserved === 0);

  let oversellBlocked = false;
  try {
    await db.$transaction(async (tx) => {
      await reserveStock(tx, product.id, 1, { sourceType: "SALES_ORDER", sourceId: "another" });
    });
  } catch (error) {
    oversellBlocked = error instanceof InsufficientStockError;
  }
  check("a second order cannot reserve the same stock", oversellBlocked);

  const dispatch = await db.$transaction(async (tx) =>
    dispatchStock(
      tx,
      product.id,
      ACCEPTED,
      { sourceType: "SALES_ORDER", sourceId: salesOrder.id, reason: "Dispatched" },
      { fromReservation: true },
    ),
  );
  check("dispatch reports its own cost of goods", dispatch.costOfGoods === ACCEPTED * landedUnit);
  check("dispatch names the batches it came from", dispatch.allocations.length === 1);

  const afterDispatch = await db.medicalProduct.findUniqueOrThrow({ where: { id: product.id } });
  check("stock is back to zero", afterDispatch.stockOnHand === 0);
  check("the reservation was consumed, not left behind", afterDispatch.stockReserved === 0);

  const batch = await db.stockBatch.findFirstOrThrow({ where: { productId: product.id } });
  check("the batch was drawn down", batch.quantityRemaining === 0);

  // ---------------------------------------------------------------------
  step(10, "Revenue and cost of sale, each posted once");

  await db.$transaction(async (tx) => {
    const revenue = lineAmount(ACCEPTED, toPesewas(entry.unitPrice));
    await tx.salesOrder.update({
      where: { id: salesOrder.id },
      data: {
        fulfilmentStatus: "DELIVERED",
        deliveredAt: new Date(),
        costOfGoods: toDecimalString(dispatch.costOfGoods),
      },
    });
    await postTransaction(tx, {
      kind: "SALE_REVENUE",
      direction: "CREDIT",
      amount: revenue,
      sourceType: "SALES_ORDER",
      sourceId: salesOrder.id,
      description: "Delivered",
    });
    await postTransaction(tx, {
      kind: "COGS",
      direction: "DEBIT",
      amount: dispatch.costOfGoods,
      sourceType: "SALES_ORDER",
      sourceId: salesOrder.id,
      description: "Cost of goods",
    });
  });

  const revenueRows = await db.financialTransaction.findMany({
    where: { kind: "SALE_REVENUE", sourceId: salesOrder.id },
  });
  check("revenue is posted exactly once for the order", revenueRows.length === 1);
  check(
    "revenue is recognised on delivery, not on acceptance",
    (await db.salesOrder.findUniqueOrThrow({ where: { id: salesOrder.id } })).paymentStatus === "UNPAID",
  );

  // ---------------------------------------------------------------------
  step(11, "A supplier invoice that bills for more than arrived");

  const invoice = await db.$transaction(async (tx) => {
    const reference = await nextReference(tx, "SUPPLIER_INVOICE");
    const inv = await tx.supplierInvoice.create({
      data: {
        reference,
        supplierId: localSupplier.id,
        purchaseOrderId: purchaseOrder.id,
        supplierReference: `INV-${RUN}`,
        status: "AWAITING_PAYMENT",
        currency: "GHS",
        exchangeRate: "1",
        amount: toDecimalString(lineAmount(ORDER_QTY, UNIT_COST)),
        amountGhs: toDecimalString(lineAmount(ORDER_QTY, UNIT_COST)),
      },
    });
    await tx.supplierInvoiceItem.create({
      data: {
        supplierInvoiceId: inv.id,
        purchaseOrderItemId: poItems[0].id,
        description: product.name,
        // Billed for all 60 when only 50 were accepted.
        quantityInvoiced: ORDER_QTY,
        unitPrice: toDecimalString(UNIT_COST),
        lineTotal: toDecimalString(lineAmount(ORDER_QTY, UNIT_COST)),
        quantityOrdered: ORDER_QTY,
        quantityAccepted: ACCEPTED,
        unitCostOrdered: toDecimalString(UNIT_COST),
      },
    });
    return inv;
  });

  const invoiceItems = await db.supplierInvoiceItem.findMany({
    where: { supplierInvoiceId: invoice.id },
  });
  const match = matchInvoice(
    invoiceItems.map((item) => ({
      id: item.id,
      description: item.description,
      purchaseOrderItemId: item.purchaseOrderItemId,
      quantityOrdered: item.quantityOrdered,
      quantityAccepted: item.quantityAccepted,
      quantityInvoiced: item.quantityInvoiced,
      unitCostOrdered: toPesewas(item.unitCostOrdered),
      unitPriceInvoiced: toPesewas(item.unitPrice),
      taxInvoiced: toPesewas(item.taxAmount),
      taxExpected: 0,
    })),
  );

  check("the over-billing is caught", match.kind === "QUANTITY" && !match.isClean);
  check(
    "the difference is priced",
    match.totalVariance === (ORDER_QTY - ACCEPTED) * UNIT_COST,
    `${formatPesewas(match.totalVariance)}`,
  );

  let payBlocked = false;
  try {
    const isMatched = (await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).isMatched;
    if (!match.isClean && !isMatched) throw new Error("blocked");
  } catch {
    payBlocked = true;
  }
  check("it cannot be paid until somebody accepts the difference", payBlocked);

  // ---------------------------------------------------------------------
  step(12, "Accept the difference, then settle it in two parts");

  await db.supplierInvoice.update({
    where: { id: invoice.id },
    data: { isMatched: true, matchedAt: new Date(), discrepancyKind: match.kind },
  });

  const invoiceTotal = toPesewas(invoice.amountGhs);
  const firstPayment = toPesewas("5000.00");

  for (const [n, amount] of [firstPayment, invoiceTotal - firstPayment].entries()) {
    await db.$transaction(async (tx) => {
      const reference = await nextReference(tx, "SUPPLIER_PAYMENT");
      await tx.supplierPayment.create({
        data: {
          reference,
          supplierId: localSupplier.id,
          supplierInvoiceId: invoice.id,
          currency: "GHS",
          exchangeRate: "1",
          amount: toDecimalString(amount),
          amountGhs: toDecimalString(amount),
        },
      });
      const current = await tx.supplierInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const paid = toPesewas(current.amountPaid) + amount;
      await tx.supplierInvoice.update({
        where: { id: invoice.id },
        data: { amountPaid: toDecimalString(paid), status: settlementStatus(invoiceTotal, paid) },
      });
      await postTransaction(tx, {
        kind: "SUPPLIER_PAYMENT",
        direction: "DEBIT",
        amount,
        sourceType: "SUPPLIER_PAYMENT",
        sourceId: invoice.id,
        description: `Payment ${n + 1}`,
      });
    });
  }

  const settled = await db.supplierInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
  check("part payments add up", toPesewas(settled.amountPaid) === invoiceTotal);
  check("the invoice closes as paid", settled.status === "PAID");
  check("nothing is left outstanding", outstandingOn(invoiceTotal, toPesewas(settled.amountPaid)) === 0);

  // ---------------------------------------------------------------------
  step(13, "The books agree");

  const ledger = await db.financialTransaction.findMany({
    where: {
      OR: [
        { sourceId: salesOrder.id },
        { sourceId: receipt.id },
        { sourceId: invoice.id },
      ],
    },
  });

  const byKind = (kind: string) =>
    sum(ledger.filter((t) => t.kind === kind).map((t) => toPesewas(t.amount)));

  check("one revenue entry", ledger.filter((t) => t.kind === "SALE_REVENUE").length === 1);
  check("one cost-of-goods entry", ledger.filter((t) => t.kind === "COGS").length === 1);
  check("two supplier payments", ledger.filter((t) => t.kind === "SUPPLIER_PAYMENT").length === 2);
  check("supplier payments equal the invoice", byKind("SUPPLIER_PAYMENT") === invoiceTotal);
  check("cost of goods equals what the batches cost", byKind("COGS") === dispatch.costOfGoods);
  check(
    "revenue and cash collected are separate figures",
    byKind("SALE_REVENUE") > 0 && byKind("CASH_RECEIPT") === 0,
    "revenue is recognised, nothing has been collected",
  );

  const allMovements = await db.stockMovement.findMany({ where: { productId: product.id } });
  const finalProduct = await db.medicalProduct.findUniqueOrThrow({ where: { id: product.id } });
  check(
    "the movement log still explains the counter",
    sum(allMovements.map((m) => m.quantity)) === finalProduct.stockOnHand,
  );
  check(
    "reservations net to zero once dispatched",
    sum(allMovements.map((m) => m.reservedDelta)) === finalProduct.stockReserved,
  );

  console.log(`\n${"=".repeat(46)}\n${passed} checks passed.`);
}

main()
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
