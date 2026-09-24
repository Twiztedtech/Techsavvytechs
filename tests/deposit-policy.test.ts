import assert from 'node:assert/strict';
import { test } from 'node:test';
import { creditToApply, depositAmount, depositBlocksClockIn, depositHoursFor, isDepositPaid } from '../api/_lib/deposit-policy.js';

const required = { depositPolicy: 'required' };
const paidDeposit = { type: 'deposit', status: 'Paid', total: 200, balance: 0 };
const openDeposit = { type: 'deposit', status: 'Open', total: 200, balance: 200 };

test('customers without the policy set are never blocked (existing customers unaffected)', () => {
  assert.equal(depositBlocksClockIn({ customer: {}, job: {}, depositInvoices: [] }).blocked, false);
  assert.equal(depositBlocksClockIn({ customer: { depositPolicy: 'waived' }, job: {}, depositInvoices: [] }).blocked, false);
  assert.equal(depositBlocksClockIn({ customer: null, job: {}, depositInvoices: [] }).blocked, false);
});

test('a required customer is blocked until the deposit invoice is paid', () => {
  assert.deepEqual(depositBlocksClockIn({ customer: required, job: {}, depositInvoices: [] }), { blocked: true, reason: 'deposit_due', establish: false });
  assert.equal(depositBlocksClockIn({ customer: required, job: {}, depositInvoices: [openDeposit] }).blocked, true);
  const paid = depositBlocksClockIn({ customer: required, job: {}, depositInvoices: [paidDeposit] });
  assert.equal(paid.blocked, false);
  assert.equal(paid.establish, true);
});

test('an established customer or a job-level waiver is never blocked', () => {
  assert.equal(depositBlocksClockIn({ customer: { ...required, depositEstablishedAt: '2026-09-01' }, job: {}, depositInvoices: [] }).blocked, false);
  assert.equal(depositBlocksClockIn({ customer: required, job: { depositWaived: true }, depositInvoices: [] }).blocked, false);
});

test('voided deposits and non-deposit invoices do not count as paid', () => {
  assert.equal(isDepositPaid({ ...paidDeposit, status: 'Void' }), false);
  assert.equal(isDepositPaid({ type: undefined, total: 100, balance: 0 }), false);
  assert.equal(isDepositPaid({ ...paidDeposit, total: 0, balance: 0 }), false);
});

test('deposit hours and amount: override, then agreement minimum, then 2', () => {
  assert.equal(depositHoursFor({}), 2);
  assert.equal(depositHoursFor({ rateAgreement: { minimumHours: 3 } }), 3);
  assert.equal(depositHoursFor({ depositHours: 4, rateAgreement: { minimumHours: 3 } }), 4);
  assert.deepEqual(depositAmount({ customerBillRate: 100 }, {}), { hours: 2, rate: 100, amount: 200 });
});

test('rate falls back to the signed agreement, and 0 means unknown', () => {
  assert.equal(depositAmount({ customerBillRate: 0 }, { rateAgreement: { standardRate: 95.5, minimumHours: 2 } }).amount, 191);
  assert.equal(depositAmount({ customerBillRate: 0 }, {}).amount, 0);
});

test('credit applied never exceeds the invoice subtotal or goes negative', () => {
  assert.equal(creditToApply(200, 500), 200);
  assert.equal(creditToApply(200, 150), 150);
  assert.equal(creditToApply(-5, 150), 0);
  assert.equal(creditToApply(200, 0), 0);
});
