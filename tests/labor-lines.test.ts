import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaborLines, nightFraction } from '../src/features/billing/laborLines.ts';

// 2026-09-29 is a Tuesday; 2026-10-03 is a Saturday.
test('nightFraction: a weekday shift inside 7-5 is all standard hours', () => {
  assert.equal(nightFraction({ date: '2026-09-29', clockIn: '11:30', clockOut: '15:30' }), 0);
});

test('nightFraction: a shift that runs past 5 PM is part night', () => {
  assert.equal(nightFraction({ date: '2026-09-29', clockIn: '15:00', clockOut: '19:00' }), 0.5);
});

test('nightFraction: weekends are entirely night', () => {
  assert.equal(nightFraction({ date: '2026-10-03', clockIn: '09:00', clockOut: '12:00' }), 1);
});

test('nightFraction: a shift crossing midnight and missing times are handled', () => {
  assert.equal(nightFraction({ date: '2026-09-29', clockIn: '22:00', clockOut: '02:00' }), 1);
  assert.equal(nightFraction({ date: '2026-09-29' }), 0);
});

test('buildLaborLines: with no night hours the line keeps the original wording', () => {
  const lines = buildLaborLines([{ date: '2026-09-29', clockIn: '11:30', clockOut: '15:30', totalHours: '4.00' }], { billRate: 95, nightRate: 140 });
  assert.deepEqual(lines, [{ description: '2026-09-29 — 1 technician — 4.00 hrs', quantity: 4, unitPrice: 95, kind: 'labor' }]);
});

test('buildLaborLines: splits standard and night hours at their own rates', () => {
  const lines = buildLaborLines([{ date: '2026-09-29', clockIn: '15:00', clockOut: '19:00', totalHours: 4 }], { billRate: 90, nightRate: 130 });
  assert.equal(lines.length, 2);
  assert.deepEqual(lines.map((l) => [l.quantity, l.unitPrice]), [[2, 90], [2, 130]]);
});

test('buildLaborLines: without a night rate everything bills at the standard rate', () => {
  const lines = buildLaborLines([{ date: '2026-10-03', clockIn: '09:00', clockOut: '12:00', totalHours: 3 }], { billRate: 90 });
  assert.deepEqual(lines.map((l) => [l.quantity, l.unitPrice]), [[3, 90]]);
});

test('buildLaborLines: applies the minimum per technician and says so', () => {
  const lines = buildLaborLines([{ date: '2026-09-29', clockIn: '09:00', clockOut: '10:00', totalHours: 1 }], { billRate: 90, minimumHours: 2 });
  assert.equal(lines[0].quantity, 2);
  assert.match(lines[0].description, /2-hr minimum applied/);
});

test('buildLaborLines: two technicians on one date stay one line', () => {
  const lines = buildLaborLines([
    { date: '2026-09-29', clockIn: '09:00', clockOut: '13:00', totalHours: 4 },
    { date: '2026-09-29', clockIn: '09:00', clockOut: '13:00', totalHours: 4 },
  ], { billRate: 90 });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 8);
  assert.match(lines[0].description, /2 technicians @ 4.00 hrs each/);
});
