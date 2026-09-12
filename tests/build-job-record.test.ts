import assert from "node:assert/strict";
import { test } from "node:test";
import { buildJobRecord } from "../src/features/jobs/buildJobRecord.ts";

const NOW = "2026-09-10T12:00:00.000Z";

test("a brand-new job always gets a real hourlyRate and signatureRequired, never undefined", () => {
  const record = buildJobRecord({ name: "Tesla Fremont" }, null, NOW);
  assert.equal(record.hourlyRate, 55);
  assert.equal(record.signatureRequired, false);
  assert.equal(record.status, "New");
  assert.deepEqual(record.equipment, []);
  assert.deepEqual(record.qaChecklist, []);
  assert.equal(record.createdAt, NOW);
});

test("customerBillRate never silently defaults to hourlyRate -- it's a different number (what the customer pays vs. what the tech is paid)", () => {
  const fresh = buildJobRecord({ name: "Job", hourlyRate: 55 }, null, NOW);
  assert.equal(fresh.customerBillRate, 0);
  assert.notEqual(fresh.customerBillRate, fresh.hourlyRate);
  const withBillRate = buildJobRecord({ name: "Job", hourlyRate: 55, customerBillRate: 95 }, null, NOW);
  assert.equal(withBillRate.hourlyRate, 55);
  assert.equal(withBillRate.customerBillRate, 95);
  const edited = buildJobRecord({ name: "Job" }, { hourlyRate: 55, customerBillRate: 95 }, NOW);
  assert.equal(edited.customerBillRate, 95);
});

test("CRM's quote-to-job conversion path (no hourlyRate/signatureRequired supplied) still gets real defaults, not undefined", () => {
  // Mirrors what CRM.tsx's convert() used to pass before saveJob() existed.
  const record = buildJobRecord(
    {
      name: "Aurora Behavioral",
      workOrderNumber: "WO-2026-00001",
      customerId: "cust-1",
      vendorName: "Aurora Behavioral",
      status: "New",
      quotedValue: 4200,
      equipment: [{ description: "Camera", quantity: "2" }],
      assignedTechIds: [],
    },
    null,
    NOW,
  );
  assert.equal(record.hourlyRate, 55);
  assert.equal(record.signatureRequired, false);
  assert.notEqual(record.hourlyRate, undefined);
  assert.notEqual(record.signatureRequired, undefined);
});

test("editing an existing job preserves fields the form doesn't touch", () => {
  const existing = {
    hourlyRate: 90,
    signatureRequired: true,
    qaChecklist: ["Test all outlets"],
    signaturePolicyUpdatedAt: "2026-01-01T00:00:00.000Z",
    signaturePolicyHistory: [{ required: true, changedAt: "2026-01-01T00:00:00.000Z", changedByUid: "admin-1" }],
  };
  const record = buildJobRecord({ name: "Aurora Behavioral", signatureRequired: true }, existing, NOW);
  assert.equal(record.hourlyRate, 90);
  assert.deepEqual(record.qaChecklist, ["Test all outlets"]);
  // Signature policy didn't change, so the history/timestamp should NOT be touched.
  assert.equal(record.signaturePolicyUpdatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal((record.signaturePolicyHistory as unknown[]).length, 1);
});

test("changing signatureRequired appends a new signature-policy history entry", () => {
  const existing = { signatureRequired: false, signaturePolicyHistory: [] };
  const record = buildJobRecord({ name: "Job", signatureRequired: true, actorUid: "admin-1" }, existing, NOW);
  const history = record.signaturePolicyHistory as Array<{ required: boolean; changedByUid: string }>;
  assert.equal(history.length, 1);
  assert.equal(history[0].required, true);
  assert.equal(history[0].changedByUid, "admin-1");
  assert.equal(record.signaturePolicyUpdatedAt, NOW);
});

test("assignedTechId mirrors the first assignedTechIds entry, or ALL", () => {
  assert.equal(buildJobRecord({ name: "J", assignedTechIds: ["ALL"] }, null, NOW).assignedTechId, "ALL");
  assert.equal(buildJobRecord({ name: "J", assignedTechIds: ["tech-1", "tech-2"] }, null, NOW).assignedTechId, "tech-1");
  assert.equal(buildJobRecord({ name: "J" }, null, NOW).assignedTechId, "");
});
