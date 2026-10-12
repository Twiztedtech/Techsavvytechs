import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_COSTING_SETTINGS, defaultPlanForJob, materialsRevenue, profitHeadline, ratesForJob, resolveSettings } from '../src/features/crm/job-profit-inputs.ts';

test('resolveSettings: defaults fill every gap and invalid values are ignored', () => {
  assert.deepEqual(resolveSettings(null), DEFAULT_COSTING_SETTINGS);
  const merged = resolveSettings({ targetMarginPct: '35', mileageRate: -1, overheadPerLaborHour: 'abc', homeBaseAddress: '  Sacramento, CA ' });
  assert.equal(merged.targetMarginPct, 35);
  assert.equal(merged.mileageRate, 0.7);
  assert.equal(merged.overheadPerLaborHour, 0);
  assert.equal(merged.homeBaseAddress, 'Sacramento, CA');
});

test('ratesForJob: the job rate wins, then the customer agreement, and never the technician pay rate', () => {
  const customer = { rateAgreement: { standardRate: 75, nightRate: 110, minimumHours: 2 } };
  assert.deepEqual(ratesForJob({ id: 'j', customerBillRate: 90, hourlyRate: 40 }, customer), { billRate: 90, nightRate: 110, minimumHours: 2 });
  assert.deepEqual(ratesForJob({ id: 'j', hourlyRate: 40 }, customer), { billRate: 75, nightRate: 110, minimumHours: 2 });
  assert.equal(ratesForJob({ id: 'j', hourlyRate: 40 }, null).billRate, 0);
});

test('materialsRevenue: counts company-supplied equipment only', () => {
  const job = { id: 'j', equipment: [{ quantity: '2', unitPrice: 50 }, { quantity: '1', unitPrice: 999, providedBy: 'client' }, { quantity: 1, unitPrice: 30, fulfillmentSource: 'customer_shipped' }, { unitPrice: 12 }] };
  assert.equal(materialsRevenue(job), 112);
});

test('defaultPlanForJob: crew is the assigned technicians, hours come from the shift, pay from the job', () => {
  const job = { id: 'j', hourlyRate: 45, assignedTechIds: ['a', 'b'], schedule: { date: '2026-10-12', start: '09:00', end: '17:00' }, customerBillRate: 90 };
  const plan = defaultPlanForJob(job, null, (id) => `Tech ${id}`);
  assert.equal(plan.crew.length, 2);
  assert.equal(plan.crew[0].name, 'Tech a');
  assert.equal(plan.crew[0].payRate, 45);
  assert.equal(plan.crew[0].plannedHours, 8);
  assert.equal(plan.pricingMode, 'hourly');
  assert.equal(plan.date, '2026-10-12');
});

test('defaultPlanForJob: estimated hours are split across the crew, ALL is not a crew, and no bill rate with a quote means fixed price', () => {
  const split = defaultPlanForJob({ id: 'j', assignedTechIds: ['a', 'b'], estimatedHours: 10 });
  assert.equal(split.crew[0].plannedHours, 5);
  assert.equal(defaultPlanForJob({ id: 'j', assignedTechIds: ['ALL'] }).crew.length, 0);
  const fixed = defaultPlanForJob({ id: 'j', assignedTechIds: ['a'], quotedValue: 1500 });
  assert.equal(fixed.pricingMode, 'fixed');
  assert.equal(fixed.fixedPrice, 1500);
});

const entry = (over = {}) => ({ jobId: 'j1', date: '2026-10-12', clockIn: '09:00', clockOut: '17:00', totalHours: 8, rate: 40, ...over });

test('profitHeadline: with no plan and no activity there is nothing to say', () => {
  const headline = profitHeadline({ job: { id: 'j1' }, entries: [], invoices: [] });
  assert.equal(headline.basis, 'none');
  assert.equal(headline.marginPct, null);
});

test('profitHeadline: a plan alone gives an estimate before any work or invoice exists', () => {
  const job = { id: 'j1', customerBillRate: 90, hourlyRate: 40, assignedTechIds: ['a'], schedule: { date: '2026-10-12', start: '09:00', end: '17:00' } };
  const headline = profitHeadline({ job, plan: defaultPlanForJob(job), entries: [], invoices: [] });
  assert.equal(headline.basis, 'estimate');
  assert.equal(headline.marginPct, 55.56); // 8 hrs: $720 billed, $320 paid
  assert.equal(headline.verdict, 'good');
});

test('profitHeadline: work done but not invoiced is projected using accrued revenue', () => {
  const job = { id: 'j1', status: 'In Progress', customerBillRate: 90, hourlyRate: 40, assignedTechIds: ['a'], schedule: { date: '2026-10-12', start: '09:00', end: '17:00' } };
  const headline = profitHeadline({ job, plan: defaultPlanForJob(job), entries: [entry()], invoices: [] });
  assert.equal(headline.basis, 'projected');
  assert.equal(headline.profit, 400);
});

test('profitHeadline: without a plan it reports actuals, and a losing job is flagged', () => {
  const job = { id: 'j1', status: 'Completed', customerBillRate: 50, hourlyRate: 60 };
  const headline = profitHeadline({ job, entries: [entry({ rate: 60 })], invoices: [] });
  assert.equal(headline.basis, 'actual');
  assert.equal(headline.verdict, 'losing');
});
