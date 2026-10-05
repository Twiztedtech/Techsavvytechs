import assert from 'node:assert/strict';
import test from 'node:test';
import { jobMargin } from '../src/features/crm/job-margin.ts';

const entry = (over = {}) => ({ jobId: 'j1', totalHours: 4, rate: 55, laborStatus: 'approved', ...over });

test('jobMargin: revenue is what was invoiced, cost is the technician pay (not the bill rate)', () => {
  const m = jobMargin({ id: 'j1', quotedValue: 9999 }, [{ jobId: 'j1', total: 380 }], [entry()]);
  assert.equal(m.basis, 'invoiced');
  assert.equal(m.revenue, 380);
  assert.equal(m.cost, 220); // 4 hrs x $55 pay
  assert.equal(Math.round(m.marginPct!), 42);
});

test('jobMargin: falls back to the quote until an invoice exists, and ignores other jobs', () => {
  const m = jobMargin({ id: 'j1', quotedValue: 500 }, [{ jobId: 'other', total: 1 }], [entry(), entry({ jobId: 'other' })]);
  assert.equal(m.basis, 'quoted');
  assert.equal(m.revenue, 500);
  assert.equal(m.cost, 220);
});

test('jobMargin: voided entries and voided invoices are excluded, and a missing cost gives no percentage', () => {
  const m = jobMargin({ id: 'j1' }, [{ jobId: 'j1', total: 380 }, { jobId: 'j1', total: 100, status: 'voided' }], [entry({ status: 'voided' })]);
  assert.equal(m.revenue, 380);
  assert.equal(m.cost, 0);
  assert.equal(m.marginPct, null);
});

test('jobMargin: travel and supplies count as cost', () => {
  const m = jobMargin({ id: 'j1' }, [{ jobId: 'j1', total: 500 }], [entry({ travelCost: 35, suppliesCost: 20 })]);
  assert.equal(m.cost, 275);
});
