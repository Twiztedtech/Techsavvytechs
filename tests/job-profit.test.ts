import assert from 'node:assert/strict';
import test from 'node:test';
import { actualToDate, estimate, planCost, planRevenue, plannedEntries, pricing, projectedAtCompletion, verdictFor, type CostPlan } from '../src/features/crm/job-profit.ts';

// 2026-09-29 is a Tuesday; 2026-10-03 is a Saturday.
const rates = { billRate: 90, nightRate: 135, minimumHours: 2 };
const settings = { mileageRate: 0.7, targetMarginPct: 30 };

const plan = (over: Partial<CostPlan> = {}): CostPlan => ({
  date: '2026-09-29', shiftStart: '09:00', shiftEnd: '17:00',
  crew: [
    { techId: 'a', payRate: 40, plannedHours: 8, travelMode: 'miles', roundTripMiles: 60, tolls: 10 },
    { techId: 'b', payRate: 40, plannedHours: 8, travelMode: 'flat', flatTravel: 25 },
  ],
  supplies: [{ amount: 100 }],
  otherCosts: [{ amount: 20 }],
  contingencyPct: 10,
  passThrough: false, // baseline: customer pays for labor only; pass-through has its own tests below
  ...over,
});

test('planCost: pays each tech their own rate, adds miles, flat travel, tolls, supplies, other and contingency', () => {
  const cost = planCost(plan(), settings);
  assert.equal(cost.labor, 640);          // 2 techs x 8 hrs x $40
  assert.equal(cost.travel, 67);          // 60 mi x $0.70 = 42, plus $25 flat
  assert.equal(cost.tolls, 10);
  assert.equal(cost.supplies, 100);
  assert.equal(cost.other, 20);
  assert.equal(cost.contingency, 83.7);   // 10% of 837 direct cost
  assert.equal(cost.total, 920.7);
  assert.equal(cost.hours, 16);
});

test('planCost: different pay rates per technician, multi-day work and optional overhead', () => {
  const cost = planCost({ crew: [{ techId: 'a', payRate: 30, plannedHours: 4, days: 3 }, { techId: 'b', payRate: 50, plannedHours: 4, days: 3, travelMode: 'miles', roundTripMiles: 20 }] }, { mileageRate: 0.5, overheadPerLaborHour: 5 });
  assert.equal(cost.labor, 360 + 600);    // 12 hrs x $30 + 12 hrs x $50
  assert.equal(cost.travel, 30);          // 20 mi x 3 days x $0.50
  assert.equal(cost.overhead, 120);       // 24 hrs x $5
  assert.equal(cost.total, 1110);
});

test('planRevenue: a weekday shift is priced at the standard rate, per technician', () => {
  const revenue = planRevenue(plan(), rates);
  assert.equal(revenue.total, 1440);      // 16 hrs x $90
  assert.equal(revenue.missingBillRate, false);
});

test('planRevenue: weekend work uses the night rate and a short shift hits the minimum', () => {
  assert.equal(planRevenue(plan({ date: '2026-10-03' }), rates).total, 2160); // 16 hrs x $135
  const short = planRevenue({ crew: [{ techId: 'a', payRate: 40, plannedHours: 1 }] }, rates);
  assert.equal(short.total, 180);         // billed at the 2-hour minimum
});

test('planRevenue: fixed price, billed materials and a missing bill rate', () => {
  assert.equal(planRevenue(plan({ pricingMode: 'fixed', fixedPrice: 1000 }), rates, 250).total, 1250);
  const missing = planRevenue(plan(), { billRate: 0 });
  assert.equal(missing.total, 0);
  assert.equal(missing.missingBillRate, true);
});

test('plannedEntries: one entry per technician per day, dated consecutively', () => {
  const entries = plannedEntries({ date: '2026-09-29', crew: [{ techId: 'a', payRate: 40, plannedHours: 8, days: 2 }] });
  assert.deepEqual(entries.map((entry) => entry.date), ['2026-09-29', '2026-09-30']);
});

test('estimate: revenue minus cost gives profit, margin and a verdict against the target', () => {
  const result = estimate(plan(), rates, settings);
  assert.equal(result.revenue, 1440);
  assert.equal(result.cost, 920.7);
  assert.equal(result.profit, 519.3);
  assert.equal(result.marginPct, 36.06);
  assert.equal(result.verdict, 'good');
});

test('verdictFor: good at or above target, thin above half of it, otherwise losing', () => {
  assert.equal(verdictFor(30, 30), 'good');
  assert.equal(verdictFor(20, 30), 'thin');
  assert.equal(verdictFor(10, 30), 'losing');
  assert.equal(verdictFor(-5, 30), 'losing');
  assert.equal(verdictFor(null, 30), 'unknown');
});

const entry = (over = {}) => ({ jobId: 'j1', date: '2026-09-29', clockIn: '09:00', clockOut: '17:00', totalHours: 8, rate: 40, ...over });

test('actualToDate: before any invoice, work done is priced at the customer rates', () => {
  const actual = actualToDate({ job: { id: 'j1', status: 'In Progress' }, entries: [entry(), entry()], rates, settings });
  assert.equal(actual.basis, 'accrued');
  assert.equal(actual.revenue, 1440);
  assert.equal(actual.cost, 640);
  assert.equal(actual.profit, 800);
  assert.equal(actual.hours, 16);
});

test('actualToDate: an invoice wins over the accrued figure, and voided items are ignored', () => {
  const actual = actualToDate({
    job: { id: 'j1' },
    entries: [entry(), entry({ status: 'voided' }), entry({ jobId: 'other' })],
    invoices: [{ jobId: 'j1', total: 600 }, { jobId: 'j1', total: 999, status: 'voided' }, { jobId: 'other', total: 5 }],
    rates,
  });
  assert.equal(actual.basis, 'invoiced');
  assert.equal(actual.revenue, 600);
  assert.equal(actual.cost, 320);         // only the one live $40 x 8 hr entry
});

test('actualToDate: timecard supplies and travel plus office-entered expenses all count, voided expenses do not', () => {
  const actual = actualToDate({
    job: { id: 'j1' },
    entries: [entry({ suppliesCost: 30, travelCost: 20 })],
    expenses: [{ jobId: 'j1', amount: 50 }, { jobId: 'j1', amount: 500, status: 'voided' }],
    invoices: [{ jobId: 'j1', total: 1000 }],
    rates,
  });
  assert.equal(actual.cost, 320 + 30 + 20 + 50);
  assert.equal(actual.expenses, 50);
});

test('actualToDate: a fixed price is earned in proportion to hours done', () => {
  const fixed = plan({ pricingMode: 'fixed', fixedPrice: 1000 });
  const half = actualToDate({ job: { id: 'j1', status: 'In Progress' }, entries: [entry()], rates, plan: fixed, settings });
  assert.equal(half.revenue, 500);        // 8 of 16 planned hours
  const done = actualToDate({ job: { id: 'j1', status: 'Completed' }, entries: [entry()], rates, plan: fixed, settings });
  assert.equal(done.revenue, 1000);
});

test('actualToDate: no entries and no invoice gives no revenue and no margin', () => {
  const actual = actualToDate({ job: { id: 'j1' }, entries: [], rates });
  assert.equal(actual.basis, 'none');
  assert.equal(actual.marginPct, null);
  assert.equal(actual.verdict, 'unknown');
});

test('projectedAtCompletion: adds the unfinished part of the plan to what has happened', () => {
  const job = { id: 'j1', status: 'In Progress' };
  const actual = actualToDate({ job, entries: [entry()], rates, settings });   // 8 of 16 hours done
  const projected = projectedAtCompletion({ job, plan: plan(), actual, rates, settings });
  assert.equal(projected.progress, 0.5);
  assert.equal(projected.revenue, 720 + 1440 * 0.5);
  assert.equal(projected.cost, 320 + 920.7 * 0.5);
});

test('projectedAtCompletion: a finished job is just its actuals', () => {
  const job = { id: 'j1', status: 'Completed' };
  const actual = actualToDate({ job, entries: [entry(), entry()], invoices: [{ jobId: 'j1', total: 1300 }], rates, settings });
  const projected = projectedAtCompletion({ job, plan: plan(), actual, rates, settings });
  assert.equal(projected.revenue, 1300);
  assert.equal(projected.cost, 640);
  assert.equal(projected.progress, 1);
});

test('pricing: price for the target margin and the bill rate that breaks even', () => {
  const result = pricing(plan(), rates, settings);
  assert.equal(result.breakEvenPrice, 920.7);
  assert.equal(result.priceForTarget, 1315.29);   // 920.7 / 0.70
  assert.equal(result.breakEvenBillRate, 57.54);  // $90 x 920.7 / 1440
  assert.equal(result.billRateForTarget, 82.21);  // $90 x 1315.29 / 1440 = 82.2056
});

test('pricing: billed materials reduce what labor has to cover, and fixed jobs have no bill rate', () => {
  assert.equal(pricing(plan(), rates, settings, 30, 400).breakEvenBillRate, 32.54); // $90 x (920.7 - 400) / 1440
  const fixed = pricing(plan({ pricingMode: 'fixed', fixedPrice: 1000 }), rates, settings);
  assert.equal(fixed.breakEvenBillRate, null);
});

// Real invoices bill approved travel, tolls and supplies at cost on top of labor.
test('planRevenue: hourly jobs bill planned travel, tolls and supplies at cost by default', () => {
  const revenue = planRevenue(plan({ passThrough: undefined }), rates, 0, settings);
  assert.equal(revenue.passThrough, 177);         // 67 travel + 10 tolls + 100 supplies
  assert.equal(revenue.total, 1617);
  const result = estimate(plan({ passThrough: undefined }), rates, settings);
  assert.equal(result.profit, 696.3);
  assert.equal(result.marginPct, 43.06);
});

test('planRevenue: a fixed price or passThrough=false adds no pass-through', () => {
  assert.equal(planRevenue(plan({ passThrough: false }), rates, 0, settings).passThrough, 0);
  assert.equal(planRevenue(plan({ pricingMode: 'fixed', fixedPrice: 1000, passThrough: undefined }), rates, 0, settings).total, 1000);
});

test('actualToDate: timecard travel and supplies, and billable expenses, are billed on top of labor', () => {
  const actual = actualToDate({
    job: { id: 'j1', status: 'In Progress' },
    entries: [entry({ travelCost: 20, suppliesCost: 30 })],
    expenses: [{ jobId: 'j1', amount: 8.5, billable: true }, { jobId: 'j1', amount: 40 }],
    rates,
  });
  assert.equal(actual.revenue, 720 + 50 + 8.5);   // 8 hrs x $90, travel + supplies, billable toll
  assert.equal(actual.cost, 320 + 50 + 8.5 + 40);
});

test('actualToDate: a fixed-price job does not add pass-through on top of the price', () => {
  const fixed = plan({ pricingMode: 'fixed', fixedPrice: 1000 });
  const actual = actualToDate({ job: { id: 'j1', status: 'Completed' }, entries: [entry({ travelCost: 20 })], rates, plan: fixed, settings });
  assert.equal(actual.revenue, 1000);
});

test('pricing: pass-through is paid back by the customer, so the hourly rate only has to cover the rest', () => {
  const result = pricing(plan({ passThrough: undefined }), rates, settings);
  assert.equal(result.breakEvenBillRate, 46.48);  // $90 x (920.7 - 177) / 1440
  assert.equal(result.billRateForTarget, 71.14);  // $90 x (1315.29 - 177) / 1440
});
