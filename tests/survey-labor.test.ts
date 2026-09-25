import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaborItems, LABOR_HOURS } from '../api/_lib/survey-labor.js';

const modules = [
  { id: 'structured_cabling', records: [{ dropCount: 4, estimatedFeet: 200, conduitRequired: true }, { dropCount: 2, estimatedFeet: 100 }] },
  { id: 'camera_security', records: [{}, {}] },
  { id: 'rf_signal', records: [{ donorCandidate: true, azimuth: 90 }, { donorCandidate: true, azimuth: 90 }, { donorCandidate: false }] },
];

test('builds driver lines and a closeout share at the given rate', () => {
  const lines = buildLaborItems({ modules, rate: 95 });
  const byKey = Object.fromEntries(lines.map((line) => [line.key, line]));
  assert.equal(byKey.cable_drops.quantity, 6 * LABOR_HOURS.cableDrop);
  assert.equal(byKey.conduit.quantity, 200 * LABOR_HOURS.conduitPerFoot);
  assert.equal(byKey.cameras.quantity, 2 * LABOR_HOURS.camera);
  assert.equal(byKey.rf_donors.quantity, LABOR_HOURS.donorAntenna); // same azimuth counts once
  assert.equal(byKey.rf_commissioning.quantity, LABOR_HOURS.rfCommissioning);
  const base = lines.filter((line) => line.key !== 'closeout').reduce((sum, line) => sum + line.quantity, 0);
  assert.equal(byKey.closeout.quantity, Math.round(base * LABOR_HOURS.closeoutShare * 100) / 100);
  assert.ok(lines.every((line) => line.unitPrice === 95));
});

test('a survey with nothing to install produces no labor', () => {
  assert.deepEqual(buildLaborItems({ modules: [{ id: 'common_site', records: [] }], rate: 95 }), []);
});

test('ignores junk numbers', () => {
  const lines = buildLaborItems({ modules: [{ id: 'structured_cabling', records: [{ dropCount: -3 }, { dropCount: 'x' }] }], rate: 0 });
  assert.equal(lines.length, 0);
});
