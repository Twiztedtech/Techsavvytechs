import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPaidNotice, entriesInPeriod, entryPay, payrollState, shiftWeek, summarizePayroll, weekRange } from '../api/_lib/payroll.js';

const base = { status: 'approved', laborStatus: 'approved', totalHours: '8.00', rate: 55, qbStatus: 'synced', technicianUid: 'a', date: '2026-10-20' };

test('entryPay counts only approved line items', () => {
  assert.deepEqual(entryPay({ ...base, bonusCost: 45, bonusStatus: 'approved' }).total, 485);
  assert.equal(entryPay({ ...base, bonusCost: 45, bonusStatus: 'pending' }).total, 440);
  assert.equal(entryPay({ ...base, laborStatus: 'rejected' }).total, 0);
  assert.equal(entryPay({ ...base, suppliesCost: '12.505', suppliesStatus: 'approved', travelCost: 35, travelStatus: 'approved' }).total, 487.51);
});

test('entryPay uses the same $75 fallback rate as the QuickBooks sync', () => {
  assert.equal(entryPay({ ...base, rate: undefined }).labor, 600);
});

test('payrollState walks an entry from review to paid', () => {
  assert.equal(payrollState({ ...base, status: 'voided' }), 'voided');
  assert.equal(payrollState({ ...base, status: 'pending' }), 'needs_review');
  assert.equal(payrollState({ ...base, bonusCost: 45, bonusStatus: 'pending' }), 'needs_review');
  assert.equal(payrollState({ ...base, qbStatus: 'pending' }), 'not_in_qbo');
  assert.equal(payrollState({ ...base, qbStatus: 'failed' }), 'not_in_qbo');
  assert.equal(payrollState(base), 'ready');
  assert.equal(payrollState({ ...base, payout: { status: 'paid' } }), 'paid');
});

test('weekRange is Monday to Sunday', () => {
  assert.deepEqual(weekRange('2026-10-22'), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(weekRange('2026-10-19'), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(weekRange('2026-10-25'), { from: '2026-10-19', to: '2026-10-25' });
  assert.deepEqual(shiftWeek('2026-10-19', -1), { from: '2026-10-12', to: '2026-10-18' });
  assert.throws(() => weekRange('nope'));
});

test('entriesInPeriod filters by date range and job', () => {
  const entries = [{ ...base, id: '1' }, { ...base, id: '2', date: '2026-10-26' }, { ...base, id: '3', jobId: 'x' }];
  assert.deepEqual(entriesInPeriod(entries, { from: '2026-10-19', to: '2026-10-25' }).map((e) => e.id), ['1', '3']);
  assert.deepEqual(entriesInPeriod(entries, { from: '2026-10-19', to: '2026-10-25', jobId: 'x' }).map((e) => e.id), ['3']);
});

test('summarizePayroll groups by technician, skips voided, tracks states', () => {
  const entries = [
    { ...base, id: '1' },
    { ...base, id: '2', date: '2026-10-21', bonusCost: 45, bonusStatus: 'approved' },
    { ...base, id: '3', qbStatus: 'pending', date: '2026-10-22' },
    { ...base, id: '4', status: 'voided' },
    { ...base, id: '5', technicianUid: 'b', rate: 65, payout: { status: 'paid' } },
  ];
  const names: Record<string, string> = { a: 'Ann', b: 'Bo' };
  const { technicians, totals } = summarizePayroll(entries, (e: any) => names[e.technicianUid]);
  assert.equal(technicians.length, 2);
  const ann = technicians[0];
  assert.equal(ann.name, 'Ann');
  assert.equal(ann.days, 3);
  assert.equal(ann.hours, 24);
  assert.equal(ann.total, 1365);
  assert.deepEqual(ann.counts, { needs_review: 0, not_in_qbo: 1, ready: 2, paid: 0 });
  assert.deepEqual(ann.entryIds.ready, ['1', '2']);
  assert.equal(technicians[1].counts.paid, 1);
  assert.equal(totals.total, 1885);
  assert.equal(totals.ready, 2);
  assert.equal(totals.paid, 1);
});

test('buildPaidNotice greets by first name, escapes html, formats the period', () => {
  const notice = buildPaidNotice({ name: 'Shawna <b>Allen</b>', amount: 2461.25, days: 5, hours: 44.75, from: '2026-10-19', to: '2026-10-23', method: 'Bank transfer', paidDate: '2026-11-28' });
  assert.match(notice.subject, /\$2,461\.25 for Oct 19 to Oct 23/);
  assert.match(notice.text, /^Hi Shawna,/);
  assert.doesNotMatch(notice.html, /<b>Allen/);
  assert.match(notice.text, /5 days, 44\.75 hours/);
  assert.match(notice.sms, /by Bank transfer/);
});
