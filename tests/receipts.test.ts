import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_RECEIPTS_PER_ENTRY, downloadUrlPrefix, isAcceptableReceiptFile, mergeReceipts, receiptFolder, sanitizeReceiptRefs } from '../api/_lib/receipts.js';

const bucket = 'demo.firebasestorage.app';
const ctx = { jobId: 'job1', uid: 'tech1', bucket };
const ref = (name: string, over: Record<string, unknown> = {}) => {
  const path = `${receiptFolder('job1', 'tech1')}${name}`;
  return { name, path, url: `${downloadUrlPrefix(bucket, path)}?alt=media&token=abc`, ...over };
};

test('receiptFolder: per job and technician, with ad-hoc for jobs that have no work order', () => {
  assert.equal(receiptFolder('job1', 'tech1'), 'job-receipts/job1/tech/tech1/');
  assert.equal(receiptFolder('', 'tech1'), 'job-receipts/ad-hoc/tech/tech1/');
});

test('sanitizeReceiptRefs: keeps receipts in the technician folder for this job with a matching url', () => {
  const result = sanitizeReceiptRefs([ref('a.jpg'), ref('b.jpg')], ctx);
  assert.deepEqual(result.map((item) => item.name), ['a.jpg', 'b.jpg']);
});

test('sanitizeReceiptRefs: drops another technician, another job, office files, path tricks and foreign urls', () => {
  const other = (path: string) => ({ name: 'x', path, url: `${downloadUrlPrefix(bucket, path)}?alt=media` });
  const input = [
    other('job-receipts/job1/tech/someone-else/a.jpg'),
    other('job-receipts/job2/tech/tech1/a.jpg'),
    other('job-receipts/job1/office/a.jpg'),
    other('job-receipts/job1/tech/tech1/../tech2/a.jpg'),
    other('job-receipts/job1/tech/tech1/nested/a.jpg'),
    ref('good.jpg', { url: 'https://evil.example/a.jpg' }),
    ref('ok.jpg'),
    null,
    'text',
  ];
  assert.deepEqual(sanitizeReceiptRefs(input, ctx).map((item) => item.name), ['ok.jpg']);
});

test('sanitizeReceiptRefs: no duplicates, a cap, and safe handling of bad input', () => {
  assert.equal(sanitizeReceiptRefs([ref('a.jpg'), ref('a.jpg')], ctx).length, 1);
  const many = Array.from({ length: 30 }, (_, index) => ref(`r${index}.jpg`));
  assert.equal(sanitizeReceiptRefs(many, ctx).length, MAX_RECEIPTS_PER_ENTRY);
  assert.deepEqual(sanitizeReceiptRefs('nope' as never, ctx), []);
  assert.deepEqual(sanitizeReceiptRefs([ref('a.jpg')], { ...ctx, uid: '' }), []);
  assert.equal(sanitizeReceiptRefs([{ ...ref('a.jpg'), name: '' }], ctx)[0].name, 'a.jpg');
});

test('isAcceptableReceiptFile: only real images within the size limit', () => {
  assert.equal(isAcceptableReceiptFile({ contentType: 'image/jpeg', size: '2048' }), true);
  assert.equal(isAcceptableReceiptFile({ contentType: 'application/pdf', size: 2048 }), false);
  assert.equal(isAcceptableReceiptFile({ contentType: 'image/png', size: 0 }), false);
  assert.equal(isAcceptableReceiptFile({ contentType: 'image/png', size: 16 * 1024 * 1024 }), false);
  assert.equal(isAcceptableReceiptFile(null), false);
});

test('mergeReceipts: keeps what was already on the timecard, adds new ones once, and caps the total', () => {
  const merged = mergeReceipts([{ path: 'a' }, { path: 'b' }], [{ path: 'b' }, { path: 'c' }]);
  assert.deepEqual(merged.map((item) => item.path), ['a', 'b', 'c']);
  assert.deepEqual(mergeReceipts(undefined, undefined), []);
  assert.equal(mergeReceipts(Array.from({ length: 20 }, (_, index) => ({ path: String(index) })), []).length, MAX_RECEIPTS_PER_ENTRY);
});
