import assert from "node:assert/strict";
import test from "node:test";
import {
  canApproveSpending,
  canReach,
  canSeeCost,
  canSeeSection,
  isMedicalRole,
  MEDICAL_ROLES,
  SECTION_ACCESS,
  sectionOf,
} from "./roles.ts";

test("sectionOf finds the section a console path belongs to", () => {
  assert.equal(sectionOf("/medicals/admin"), "");
  assert.equal(sectionOf("/medicals/admin/"), "");
  assert.equal(sectionOf("/medicals/admin/tenders"), "tenders");
  assert.equal(sectionOf("/medicals/admin/tenders/abc123"), "tenders");
  assert.equal(sectionOf("/medicals/admin/goods-received/new"), "goods-received");
});

test("the owner reaches everything, including a section nobody else can", () => {
  assert.equal(canReach("OWNER", "/medicals/admin/settings"), true);
  assert.equal(canReach("OWNER", "/medicals/admin/staff"), true);
  assert.equal(canReach("OWNER", "/medicals/admin/tenders"), true);
  for (const section of Object.keys(SECTION_ACCESS)) {
    assert.equal(canReach("OWNER", `/medicals/admin/${section}`), true, section);
  }
});

test("an unknown section is closed to everyone but the owner", () => {
  // A page added without a line in the table should 404 rather than be open.
  for (const role of MEDICAL_ROLES) {
    if (role === "OWNER") continue;
    assert.equal(canReach(role, "/medicals/admin/not-a-real-section"), false, role);
  }
});

test("roles are kept apart where it matters", () => {
  // Stores receives goods; it does not price quotations or pay suppliers.
  assert.equal(canReach("STORES", "/medicals/admin/goods-received"), true);
  assert.equal(canReach("STORES", "/medicals/admin/quotations"), false);
  assert.equal(canReach("STORES", "/medicals/admin/payables"), false);

  // Sales quotes and bids; it does not see supplier pricing.
  assert.equal(canReach("SALES", "/medicals/admin/tenders"), true);
  assert.equal(canReach("SALES", "/medicals/admin/quotations"), true);
  assert.equal(canReach("SALES", "/medicals/admin/supplier-quotes"), false);
  assert.equal(canReach("SALES", "/medicals/admin/payables"), false);

  // Procurement buys; it does not run the tender desk.
  assert.equal(canReach("PROCUREMENT", "/medicals/admin/purchase-orders"), true);
  assert.equal(canReach("PROCUREMENT", "/medicals/admin/tenders"), false);

  // Support answers customers and nothing else.
  assert.equal(canReach("SUPPORT", "/medicals/admin/institutions"), true);
  assert.equal(canReach("SUPPORT", "/medicals/admin/purchase-orders"), false);
  assert.equal(canReach("SUPPORT", "/medicals/admin/inventory"), false);
});

test("settings and staff are the owner's alone", () => {
  for (const role of MEDICAL_ROLES) {
    if (role === "OWNER") continue;
    assert.equal(canReach(role, "/medicals/admin/settings"), false, role);
    assert.equal(canReach(role, "/medicals/admin/staff"), false, role);
  }
});

test("everybody with a staff account sees the overview", () => {
  for (const role of MEDICAL_ROLES) {
    assert.equal(canReach(role, "/medicals/admin"), true, role);
  }
});

test("the sidebar and the page guard agree", () => {
  // The thing this prevents: a menu that offers a section the page refuses.
  for (const role of MEDICAL_ROLES) {
    for (const section of Object.keys(SECTION_ACCESS)) {
      assert.equal(
        canSeeSection(role, section),
        canReach(role, `/medicals/admin/${section}`),
        `${role} / ${section}`,
      );
    }
  }
});

test("cost is visible only to the roles that need it", () => {
  assert.equal(canSeeCost("SALES"), false, "a price can be quoted without knowing the margin");
  assert.equal(canSeeCost("SUPPORT"), false);
  assert.equal(canSeeCost("STORES"), false);
  assert.equal(canSeeCost("PROCUREMENT"), true);
  assert.equal(canSeeCost("FINANCE"), true);
  assert.equal(canSeeCost("MANAGER"), true);
  assert.equal(canSeeCost("OWNER"), true);
});

test("spending is approved by the roles accountable for it", () => {
  assert.equal(canApproveSpending("PROCUREMENT"), false, "the buyer does not approve their own order");
  assert.equal(canApproveSpending("STORES"), false);
  assert.equal(canApproveSpending("SALES"), false);
  assert.equal(canApproveSpending("FINANCE"), true);
  assert.equal(canApproveSpending("MANAGER"), true);
  assert.equal(canApproveSpending("OWNER"), true);
});

test("isMedicalRole narrows a string from the database", () => {
  assert.equal(isMedicalRole("PROCUREMENT"), true);
  assert.equal(isMedicalRole("ADMIN"), false, "a retail role is not a medical one");
  assert.equal(isMedicalRole(null), false);
  assert.equal(isMedicalRole(""), false);
});
