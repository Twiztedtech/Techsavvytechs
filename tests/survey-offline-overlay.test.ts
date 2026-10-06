import assert from 'node:assert/strict';
import test from 'node:test';
import { overlayQueuedChanges } from '../src/features/surveys/offline-overlay.ts';

const survey: any = {
  id: 's1', surveyNumber: 'SV-1', status: 'in_progress', customerName: 'Acme', siteName: 'HQ', siteAddress: '1 Main', moduleKeys: ['common_site', 'structured_cabling'],
  modules: [
    { id: 'common_site', moduleKey: 'common_site', definition: { title: 'Site', version: 1 }, answers: { accessNotes: 'old' }, records: [] },
    { id: 'structured_cabling', moduleKey: 'structured_cabling', definition: { title: 'Cabling', version: 1 }, answers: {}, records: [{ id: 'r1', label: 'Cam 1', estimatedFeet: 50 }] },
  ],
  attachments: [],
};

test('overlay: queued site-condition answers are merged over the cached ones', () => {
  const out = overlayQueuedChanges(survey, [{ id: 's1', action: 'saveModule', moduleKey: 'common_site', answers: { parkingNotes: 'lot B' } }]);
  assert.deepEqual(out.modules![0].answers, { accessNotes: 'old', parkingNotes: 'lot B' });
});

test('overlay: a queued new item appears, and a queued edit replaces the cached item', () => {
  const out = overlayQueuedChanges(survey, [
    { id: 's1', action: 'upsertRecord', moduleKey: 'structured_cabling', recordId: 'offline-1', record: { label: 'Cam 2' } },
    { id: 's1', action: 'upsertRecord', moduleKey: 'structured_cabling', recordId: 'r1', record: { label: 'Cam 1', estimatedFeet: 80 } },
  ]);
  const records = out.modules![1].records;
  assert.deepEqual(records.map((r) => [r.id, r.label, r.estimatedFeet]), [['r1', 'Cam 1', 80], ['offline-1', 'Cam 2', undefined]]);
});

test('overlay: a queued delete removes the item and its photos', () => {
  const withPhoto = { ...survey, attachments: [{ id: 'a1', moduleKey: 'structured_cabling', recordId: 'r1', url: 'https://x/y.jpg' }] };
  const out = overlayQueuedChanges(withPhoto, [{ id: 's1', action: 'deleteRecord', moduleKey: 'structured_cabling', recordId: 'r1' }]);
  assert.equal(out.modules![1].records.length, 0);
  assert.equal(out.attachments!.length, 0);
});

test('overlay: a queued photo shows from its own data, with its type', () => {
  const out = overlayQueuedChanges(survey, [{ id: 's1', action: 'uploadAttachment', moduleKey: 'structured_cabling', recordId: 'r1', dataUrl: 'data:image/jpeg;base64,AAAA', caption: 'rack.jpg' }]);
  assert.equal(out.attachments!.length, 1);
  assert.equal(out.attachments![0].url, 'data:image/jpeg;base64,AAAA');
  assert.equal(out.attachments![0].contentType, 'image/jpeg');
  assert.equal(out.attachments![0].recordId, 'r1');
});

test('overlay: changes queued for another survey are ignored and the input is not mutated', () => {
  const before = JSON.stringify(survey);
  const same = overlayQueuedChanges(survey, [{ id: 'other', action: 'saveModule', moduleKey: 'common_site', answers: { accessNotes: 'x' } }]);
  assert.equal(same, survey);
  overlayQueuedChanges(survey, [{ id: 's1', action: 'saveModule', moduleKey: 'common_site', answers: { accessNotes: 'new' } }]);
  assert.equal(JSON.stringify(survey), before);
});
