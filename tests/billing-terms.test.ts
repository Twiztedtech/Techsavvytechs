import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PAYMENT_TERMS, dueDateFor, termsDays } from '../src/features/billing/terms.ts';

test('net 15 is the site standard', () => {
  assert.equal(DEFAULT_PAYMENT_TERMS, 'Net 15');
  assert.equal(termsDays(), 15);
  assert.equal(termsDays('whatever'), 15);
});

test('terms labels map to days and due dates', () => {
  assert.equal(termsDays('Net 30'), 30);
  assert.equal(termsDays('Due on receipt'), 0);
  assert.equal(dueDateFor('2026-11-03', 'Net 15'), '2026-11-18');
  assert.equal(dueDateFor('2026-11-03', 'Net 30'), '2026-12-03');
  assert.equal(dueDateFor('2026-11-03', 'Due on receipt'), '2026-11-03');
  assert.equal(dueDateFor('2026-12-25', 'Net 15'), '2027-01-09');
});
