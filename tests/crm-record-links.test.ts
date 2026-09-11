import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assignmentIds, customerFor, isClosedJob, laborSummary, localDate, needsDispatch } from '../src/features/crm/record-links.ts';
import { businessClock, businessDate } from '../api/_lib/business-time.js';
test('legacy approved timecards count without billing markers, rejected/voided/running do not', () => {
  assert.deepEqual(laborSummary([
    { totalHours: '9', status: 'approved', laborStatus: 'approved' },
    { totalHours: '7.5', status: 'approved' },
    { totalHours: 13, status: 'rejected', laborStatus: 'rejected' },
    { totalHours: 8, status: 'voided', laborStatus: 'approved' },
    { totalHours: 1, active: true }, { totalHours: 2, laborStatus: 'pending' },
    { totalHours: 'invalid', status: 'approved' },
  ]), { submitted: 18.5, approved: 16.5, pending: 2 });
});
test('stable customer ID wins; ambiguous names never auto-link', () => {
  const customers = [{ id: 'a', name: 'ATG' }, { id: 'b', name: 'ATG' }];
  assert.equal(customerFor({ vendorName: 'ATG' }, customers), undefined);
  assert.equal(customerFor({ customerId: 'a', vendorName: 'Other' }, customers)?.id, 'a');
  assert.equal(customerFor({ customerId: 'missing', vendorName: 'ATG' }, customers), undefined);
  assert.equal(customerFor({ vendorName: ' atg ' }, customers.slice(0, 1))?.id, 'a');
});
test('assignment IDs retain lead order and do not duplicate', () => assert.deepEqual(assignmentIds({ assignedTechId: 'b', assignedTechIds: ['a', 'b'] }), ['b', 'a']));
test('"ALL" assignment still needs dispatch; a specific technician does not', () => {
  assert.equal(needsDispatch({}), true);
  assert.equal(needsDispatch({ assignedTechIds: [] }), true);
  assert.equal(needsDispatch({ assignedTechIds: ['ALL'] }), true);
  assert.equal(needsDispatch({ assignedTechId: 'ALL' }), true);
  assert.equal(needsDispatch({ assignedTechIds: ['ALL', 'tech-1'] }), false);
  assert.equal(needsDispatch({ assignedTechId: 'tech-1' }), false);
});
test('billing-complete jobs do not inflate active workload', () => {
  for (const status of ['Invoiced', 'Ready to Invoice', 'Field Complete', 'voided']) assert.equal(isClosedJob({ status }), true);
  assert.equal(isClosedJob({ status: 'Scheduled' }), false);
});
test('calendar and clocks use Pacific time, including UTC date rollover and DST', () => {
  const summer = new Date('2026-09-04T01:30:00Z');
  assert.equal(localDate(summer), '2026-09-03');
  assert.equal(businessDate(summer), '2026-09-03');
  assert.equal(businessClock(summer), '18:30');
  assert.equal(businessClock(new Date('2026-01-04T01:30:00Z')), '17:30');
});
