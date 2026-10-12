import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_COSTING_SETTINGS, defaultPlanForJob, irsMileageRate, materialsRevenue, profitHeadline, ratesForJob, resolveSettings } from '../src/features/crm/job-profit-inputs.ts';

test('irsMileageRate: uses the rate in effect on the date, including the July 2026 mid-year change', () => {
  assert.equal(irsMileageRate('2025-06-15'), 0.7);
  assert.equal(irsMileageRate('2026-03-01'), 0.725);
  assert.equal(irsMileageRate('2026-06-30'), 0.725);
  assert.equal(irsMileageRate('2026-07-01'), 0.76);
  assert.equal(irsMileageRate('2027-01-15'), 0.76);   // newest known rate until the table is updated
  assert.equal(irsMileageRate('2024-01-01'), 0.7);    // earlier than the table: the oldest rate
  assert.equal(irsMileageRate(new Date('2026-10-12T12:00:00Z')), 0.76);
});

test('resolveSettings: defaults fill every gap and invalid values are ignored', () => {
  const defaults = resolveSettings(null, '2026-10-12');
  assert.equal(defaults.mileageRate, 0.76);
  assert.equal(defaults.mileageRateIsFederal, true);
  assert.equal(defaults.targetMarginPct, DEFAULT_COSTING_SETTINGS.targetMarginPct);
  const merged = resolveSettings({ targetMarginPct: '35', mileageRate: -1, overheadPerLaborHour: 'abc', homeBaseAddress: '  Sacramento, CA ' }, '2026-10-12');
  assert.equal(merged.targetMarginPct, 35);
  assert.equal(merged.mileageRate, 0.76);             // invalid saved rate falls back to the federal rate
  assert.equal(merged.overheadPerLaborHour, 0);
  assert.equal(merged.homeBaseAddress, 'Sacramento, CA');
});

test('resolveSettings: a saved mileage rate overrides the federal rate and is flagged as custom', () => {
  const custom = resolveSettings({ mileageRate: 0.6 }, '2026-10-12');
  assert.equal(custom.mileageRate, 0.6);
  assert.equal(custom.mileageRateIsFederal, false);
  assert.equal(custom.federalMileageRate, 0.76);
  assert.equal(resolveSettings({ mileageRate: 0.76 }, '2026-10-12').mileageRateIsFederal, true);
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

import { estimate } from '../src/features/crm/job-profit.ts';
import { estimatorPlan, type EstimatorInput } from '../src/features/crm/job-profit-inputs.ts';

const estimatorInput = (over: Partial<EstimatorInput> = {}): EstimatorInput => ({
  techCount: 3, hoursPerDay: 8, days: 2, payRate: 45, travelMode: 'miles', milesPerDay: 50, flatTravel: 0, tollsPerTech: 10,
  date: '2026-10-14', shiftStart: '09:00', shiftEnd: '17:00', pricingMode: 'hourly', fixedPrice: 0, supplies: [{ description: 'Cable', amount: 200 }, { amount: 0 }], otherCosts: [], ...over,
});

test('estimatorPlan: builds open positions with the same pay, hours, days and travel for each', () => {
  const plan = estimatorPlan(estimatorInput());
  assert.equal(plan.crew.length, 3);
  assert.deepEqual(plan.crew.map((member) => member.techId), ['slot-1', 'slot-2', 'slot-3']);
  assert.equal(plan.crew[0].days, 2);
  assert.equal(plan.supplies?.length, 1);            // the empty $0 supply line is dropped
});

test('estimatorPlan: a what-if job prices like the real thing (3 techs x 2 days x 8 hrs at $90 against $45 pay)', () => {
  const settings = { mileageRate: 0.76, targetMarginPct: 30 };
  const result = estimate(estimatorPlan(estimatorInput()), { billRate: 90, nightRate: 135, minimumHours: 2 }, settings);
  assert.equal(result.costDetail.hours, 48);
  assert.equal(result.costDetail.labor, 2160);
  assert.equal(result.costDetail.travel, 228);       // 50 mi x 2 days x 3 techs x $0.76
  assert.equal(result.costDetail.tolls, 30);
  assert.equal(result.revenueDetail.labor, 4320);    // 48 hrs x $90
  assert.equal(result.revenueDetail.passThrough, 458); // travel + tolls + supplies billed at cost
  assert.equal(result.profit, 2160);                 // labor margin only
  assert.equal(result.verdict, 'good');
});

test('estimatorPlan: zero technicians gives an empty crew, and flat travel is carried through', () => {
  assert.equal(estimatorPlan(estimatorInput({ techCount: 0 })).crew.length, 0);
  const flat = estimatorPlan(estimatorInput({ travelMode: 'flat', flatTravel: 60, techCount: 1 }));
  assert.equal(flat.crew[0].travelMode, 'flat');
  assert.equal(flat.crew[0].flatTravel, 60);
});
