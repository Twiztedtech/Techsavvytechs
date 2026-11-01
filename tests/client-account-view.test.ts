import assert from 'node:assert/strict';
import test from 'node:test';
import { accountInvoices, canSeeInvoices, canSeeRequest, invoiceView, requestView, visibleRequests } from '../api/_lib/client-account-view.js';

const admin = { id: 'u1', customerId: 'c1', roles: ['company_admin'] };
const member = { id: 'u2', customerId: 'c1', roles: ['project_viewer'] };
const billing = { id: 'u3', customerId: 'c1', roles: ['billing'] };
const doc = (id: string, data: Record<string, unknown>) => ({ id, data });

test('company admins see every company request, others only their own, nobody sees another company', () => {
  const mine = { customerId: 'c1', createdByClientUid: 'u2' };
  const colleague = { customerId: 'c1', createdByClientUid: 'u9' };
  const other = { customerId: 'c2', createdByClientUid: 'u2' };
  assert.equal(canSeeRequest(admin, colleague), true);
  assert.equal(canSeeRequest(member, mine), true);
  assert.equal(canSeeRequest(member, colleague), false);
  assert.equal(canSeeRequest(admin, other), false);
  assert.equal(canSeeRequest({ roles: ['company_admin'] }, other), false);
});

test('requests hide internal fields and show the note only when it was written for the customer', () => {
  const base = { requestNumber: 'TS-1', siteName: 'MAI', requestedWindows: [{ date: '2026-11-03', start: '11:00', end: '12:00' }], reviewNote: 'Which suite?', statusTokenHash: 'secret', reviewedByUid: 'staff', internalNotes: 'x' };
  const asking = requestView('r1', { ...base, status: 'clarification_needed' });
  assert.equal(asking.note, 'Which suite?');
  assert.equal(asking.statusLabel, 'We need more information');
  assert.equal(JSON.stringify(asking).includes('secret'), false);
  assert.equal('reviewedByUid' in asking, false);
  assert.equal(requestView('r1', { ...base, status: 'reviewing' }).note, '');
  assert.equal(requestView('r1', { ...base, status: 'declined' }).note, 'Which suite?');
  assert.equal(requestView('r1', { ...base, status: 'weird' }).status, 'requested');
});

test('requests come back newest first', () => {
  const list = visibleRequests(admin, [
    doc('a', { customerId: 'c1', createdAt: '2026-10-01', status: 'requested' }),
    doc('b', { customerId: 'c1', createdAt: '2026-10-28', status: 'requested' }),
    doc('c', { customerId: 'c2', createdAt: '2026-10-30', status: 'requested' }),
  ]);
  assert.deepEqual(list.map((r) => r.id), ['b', 'a']);
});

test('only billing and company admins can see invoices', () => {
  assert.equal(canSeeInvoices(admin), true);
  assert.equal(canSeeInvoices(billing), true);
  assert.equal(canSeeInvoices(member), false);
  assert.equal(accountInvoices(member, [], '2026-11-01'), null);
});

test('invoices skip drafts and voids, flag overdue and total what is owed', () => {
  const today = '2026-11-01';
  const result = accountInvoices(billing, [
    doc('i1', { invoiceNumber: 'INV-1', status: 'Open', total: 500, balance: 500, dueDate: '2026-10-15', issueDate: '2026-10-01', qboSync: { invoiceLink: 'https://qbo.example/pay/1', syncToken: 'private' }, jobId: 'j1' }),
    doc('i2', { invoiceNumber: 'INV-2', status: 'Open', total: 300, balance: 0, dueDate: '2026-10-20', issueDate: '2026-10-05' }),
    doc('i3', { invoiceNumber: 'INV-3', status: 'Draft', total: 900, balance: 900 }),
    doc('i4', { invoiceNumber: 'INV-4', status: 'voided', total: 100, balance: 100 }),
    doc('i5', { invoiceNumber: 'INV-5', status: 'Open', total: 250.5, balance: 250.5, dueDate: '2026-11-20', issueDate: '2026-10-25' }),
  ], today, { j1: 'WO-1' })!;
  assert.deepEqual(result.invoices.map((i) => i.number), ['INV-5', 'INV-2', 'INV-1']);
  assert.equal(result.outstandingTotal, 750.5);
  assert.equal(result.overdueCount, 1);
  const first = result.invoices.find((i) => i.number === 'INV-1')!;
  assert.equal(first.status, 'Overdue');
  assert.equal(first.jobNumber, 'WO-1');
  assert.equal(first.paymentLink, 'https://qbo.example/pay/1');
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('a payment link must be https and a missing link is empty', () => {
  assert.equal(invoiceView('x', { total: 10, balance: 10, qboSync: { invoiceLink: 'javascript:alert(1)' } }, '2026-11-01').paymentLink, '');
  assert.equal(invoiceView('x', { total: 10, balance: 10 }, '2026-11-01').paymentLink, '');
});
