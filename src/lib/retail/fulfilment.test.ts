import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FULFILMENT_LABELS,
  FULFILMENT_STAGES,
  deriveStage,
  isFulfilmentStage,
  nextAction,
  stageLabelFor,
  stageProgress,
} from "./fulfilment.ts";

const AT = new Date(2026, 9, 16);

test("money comes before fulfilment", () => {
  // A cancelled order has no stage to be at, whatever its shipment says.
  assert.equal(
    deriveStage({ status: "cancelled", shipment: { deliveredAt: AT }, placed: true }),
    "cancelled",
  );
  assert.equal(deriveStage({ status: "pending" }), "awaiting_payment");
  // Even one that somehow carries a shipment: nothing has been paid for.
  assert.equal(deriveStage({ status: "pending", shipment: { transitAt: AT } }), "awaiting_payment");
});

test("a paid order is waiting to be placed until something says otherwise", () => {
  assert.equal(deriveStage({ status: "paid" }), "placing");
  assert.equal(deriveStage({ status: "paid", shipment: {} }), "placing");
  // A purchase recorded against one of its lines is what moves it on, on the
  // day before the shipment has been touched.
  assert.equal(deriveStage({ status: "paid", placed: true }), "ordered");
});

test("the furthest confirmation is the stage", () => {
  // Confirming a later stage back-fills the earlier ones, so the latest
  // timestamp is the only one that says where the goods are.
  const stamps = {
    processingAt: AT,
    forwarderReceivedAt: AT,
    transitAt: AT,
    arrivedGhanaAt: AT,
  };
  assert.equal(deriveStage({ status: "shipped", shipment: stamps }), "arrived_ghana");
  assert.equal(
    deriveStage({ status: "shipped", shipment: { ...stamps, outForDeliveryAt: AT } }),
    "ready",
  );
  assert.equal(
    deriveStage({ status: "delivered", shipment: { ...stamps, outForDeliveryAt: AT, deliveredAt: AT } }),
    "collected",
  );
});

test("a forced status is still read, where there is no confirmation to read", () => {
  assert.equal(deriveStage({ status: "delivered" }), "collected");
  assert.equal(deriveStage({ status: "shipped" }), "in_transit");
  // But a confirmation beats the forced word: the timeline is the record.
  assert.equal(deriveStage({ status: "shipped", shipment: { processingAt: AT } }), "ordered");
});

test("every stage has a label, and the filter options are stages", () => {
  for (const stage of FULFILMENT_STAGES) {
    assert.ok(FULFILMENT_LABELS[stage], stage);
    assert.ok(isFulfilmentStage(stage));
  }
  assert.equal(isFulfilmentStage("whatever"), false);
});

test("the wording follows how the order travels", () => {
  // The same stage: one is fetched, the other is dropped at a door, and
  // calling both by one name is how a buyer is told to come and collect a
  // parcel that is already on their step.
  assert.equal(stageLabelFor("collected", "pickup", "abroad"), "Collected by buyer");
  assert.equal(stageLabelFor("collected", "delivery", "abroad"), "Delivered");
  assert.equal(stageLabelFor("ready", "pickup", "domestic"), "Ready for pickup");
  assert.equal(stageLabelFor("ready", "delivery", "domestic"), "Out for delivery");
  // "Ordered from the supplier" is wrong for a shop packing its own stock.
  assert.equal(stageLabelFor("ordered", "pickup", "abroad"), "Ordered from supplier");
  assert.equal(stageLabelFor("ordered", "pickup", "domestic"), "Prepared by seller");
});

test("every live stage hands the order to somebody", () => {
  for (const stage of FULFILMENT_STAGES) {
    const action = nextAction(stage, "pickup", "abroad");
    if (stage === "collected" || stage === "cancelled") {
      assert.equal(action, null, stage);
    } else {
      assert.ok(action?.label, stage);
      assert.ok(action?.detail, stage);
    }
  }
});

test("the next action is the next stage on this order's route", () => {
  // An imported consignment sits at a forwarder; a parcel crossing Accra does
  // not, so its next stop after being packed is the courier.
  assert.equal(nextAction("ordered", "pickup", "abroad")?.stage, "at_forwarder");
  assert.equal(nextAction("ordered", "pickup", "domestic")?.stage, "in_transit");
  // Nothing is confirmed to place an order — it is bought, elsewhere.
  assert.equal(nextAction("placing", "pickup", "abroad")?.href, "/admin/orders/placement");
  assert.equal(nextAction("placing", "pickup", "domestic")?.stage, "processing");
});

test("the progress rail runs from nothing to done, on either route", () => {
  for (const route of ["domestic", "abroad"] as const) {
    assert.equal(stageProgress("awaiting_payment", route), 0);
    assert.equal(stageProgress("collected", route), 1);
    assert.equal(stageProgress("cancelled", route), 0);
    // Monotonic: a later stage is never drawn shorter than an earlier one.
    const run = FULFILMENT_STAGES.filter((s) => s !== "cancelled");
    let last = -1;
    for (const stage of run) {
      const at = stageProgress(stage, route);
      assert.ok(at >= last || at === 0, `${route}/${stage}`);
      if (at > 0) last = at;
    }
  }
});
