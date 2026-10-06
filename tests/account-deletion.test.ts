import assert from 'node:assert/strict';
import test from 'node:test';
import { isRecentSignIn, retentionEnd, scrubbedContractorFields, unassignedJobFields } from '../api/_lib/account-deletion.js';

const NOW = Date.UTC(2026, 9, 5, 12, 0, 0);

test('isRecentSignIn: only a sign-in from the last 5 minutes counts', () => {
  assert.equal(isRecentSignIn(NOW / 1000 - 60, NOW), true);
  assert.equal(isRecentSignIn(NOW / 1000 - 299, NOW), true);
  assert.equal(isRecentSignIn(NOW / 1000 - 301, NOW), false);
  assert.equal(isRecentSignIn(NOW / 1000 - 3600, NOW), false);
});

test('isRecentSignIn: a missing, junk or far-future time is rejected', () => {
  assert.equal(isRecentSignIn(undefined, NOW), false);
  assert.equal(isRecentSignIn('abc', NOW), false);
  assert.equal(isRecentSignIn(NOW / 1000 + 3600, NOW), false);
});

test('retentionEnd: four years on', () => {
  assert.equal(retentionEnd(new Date('2026-10-05T12:00:00.000Z')), '2030-10-05T12:00:00.000Z');
});

test('scrubbedContractorFields: personal data is cleared and the login link is cut', () => {
  const f: any = scrubbedContractorFields('2026-10-05T12:00:00.000Z', '2030-10-05T12:00:00.000Z');
  assert.equal(f.name, 'Deleted technician');
  for (const key of ['email', 'mobile', 'profilePhotoUrl']) assert.equal(f[key], '');
  assert.deepEqual([f.skills, f.tools, f.certifications], [[], [], []]);
  assert.equal(f.signature.dataUrl, '');
  assert.equal(f.authUid, null);
  assert.equal(f.active, false);
  assert.equal(f.accessStatus, 'Deleted');
  assert.equal(f.retainedUntil, '2030-10-05T12:00:00.000Z');
});

test('scrubbedContractorFields: leaves the retained financial fields alone', () => {
  const f: any = scrubbedContractorFields('2026-10-05T12:00:00.000Z', '2030-10-05T12:00:00.000Z');
  for (const kept of ['rate', 'onboarding', 'qboVendorId', 'lifecycleHistory', 'employmentType']) assert.equal(kept in f, false, `${kept} must not be touched`);
});

test('scrubbedContractorFields: no field is undefined (Firestore rejects undefined)', () => {
  const f: any = scrubbedContractorFields('2026-10-05T12:00:00.000Z', '2030-10-05T12:00:00.000Z');
  for (const [key, value] of Object.entries(f)) assert.notEqual(value, undefined, key);
});

test('unassignedJobFields: removes only this technician and clears the lead if it was them', () => {
  const job = { assignedTechIds: ['a', 'b', 'c'], technicianLeadId: 'b', assignedTechId: 'b', assignedTechName: 'B' };
  const out: any = unassignedJobFields(job, 'b', 'now');
  assert.deepEqual(out.assignedTechIds, ['a', 'c']);
  assert.equal(out.technicianLeadId, '');
  assert.equal(out.assignedTechName, '');
  const other: any = unassignedJobFields({ assignedTechIds: ['a', 'b'], technicianLeadId: 'a' }, 'b', 'now');
  assert.deepEqual(other.assignedTechIds, ['a']);
  assert.equal('technicianLeadId' in other, false);
});
