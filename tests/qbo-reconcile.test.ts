import assert from 'node:assert/strict';
import test from 'node:test';
import { qboObjectNotFound, reconcileChangeSummary } from '../api/_lib/qbo-reconcile.js';

test('qboObjectNotFound recognizes a deleted QuickBooks invoice and nothing else', () => {
  const deleted = '{"Fault":{"Error":[{"Message":"Object Not Found","Detail":"Object Not Found : Something you\'re trying to use has been made inactive.","code":"610","element":""}],"type":"ValidationFault"}}';
  assert.equal(qboObjectNotFound(deleted), true);
  assert.equal(qboObjectNotFound('{"Fault":{"Error":[{"Message":"message=AuthenticationFailed","code":"3200"}],"type":"AUTHENTICATION"}}'), false);
  assert.equal(qboObjectNotFound('Service unavailable'), false);
  assert.equal(qboObjectNotFound(undefined), false);
});

test('reconcileChangeSummary explains deleted invoices', () => {
  assert.equal(reconcileChangeSummary({ invoiceNumber: 'INV-1', previousBalance: 10, balance: 0 }), 'QuickBooks updated INV-1: balance 10 → 0');
  assert.match(reconcileChangeSummary({ invoiceNumber: 'INV-2', deletedInQbo: true }), /deleted in QuickBooks, so it was voided/);
  assert.match(reconcileChangeSummary({ invoiceNumber: 'INV-3', deletedInQbo: true, needsReview: true }), /has payments recorded in the CRM; review it/);
});
