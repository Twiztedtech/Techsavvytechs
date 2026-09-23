import assert from "node:assert/strict";
import { test } from "node:test";
import { jobAccessDecision, jobEditState } from "../api/_lib/job-access.js";

const admin = { id: "u-admin", customerId: "acme", roles: ["company_admin"] };
const viewer = { id: "u-view", customerId: "acme", roles: ["project_viewer"] };
const acmeJob = { customerId: "acme", createdByClientUid: "u-other", status: "New" };
const otherCompanyJob = { customerId: "globex", createdByClientUid: "u-x", status: "New" };

test("a company administrator sees every job of their own company", () => {
  assert.equal(jobAccessDecision(admin, acmeJob, false), true);
});

test("a company administrator can never open another company's job", () => {
  assert.equal(jobAccessDecision(admin, otherCompanyJob, false), false);
  assert.equal(jobAccessDecision(admin, otherCompanyJob, true), false);
});

test("a regular user sees only jobs they created or were added to", () => {
  assert.equal(jobAccessDecision(viewer, acmeJob, false), false);
  assert.equal(jobAccessDecision(viewer, { ...acmeJob, createdByClientUid: "u-view" }, false), true);
  assert.equal(jobAccessDecision(viewer, acmeJob, true), true);
});

test("participation in another company's job does not grant access", () => {
  assert.equal(jobAccessDecision(viewer, otherCompanyJob, true), false);
});

test("missing job or company denies access", () => {
  assert.equal(jobAccessDecision(admin, null, false), false);
  assert.equal(jobAccessDecision({ id: "u", roles: ["company_admin"] }, acmeJob, false), false);
});

test("a company administrator can edit an unscheduled job", () => {
  assert.equal(jobEditState(admin, acmeJob).allowed, true);
  assert.equal(jobEditState(admin, { ...acmeJob, clientStatus: "scheduling" }).allowed, true);
});

test("the person who requested a job can edit it, other regular users cannot", () => {
  assert.equal(jobEditState(viewer, { ...acmeJob, createdByClientUid: "u-view" }).allowed, true);
  const denied = jobEditState(viewer, acmeJob);
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /company administrator or the person who requested/);
});

test("details lock once the job is scheduled or underway", () => {
  for (const job of [
    { ...acmeJob, clientStatus: "scheduled" },
    { ...acmeJob, clientStatus: "in_progress" },
    { ...acmeJob, status: "Scheduled" },
    { ...acmeJob, schedule: { date: "2026-10-14" } },
  ]) {
    const state = jobEditState(admin, job);
    assert.equal(state.allowed, false);
    assert.match(state.reason, /scope change/);
  }
});
