// Receipt photos a technician attaches to a timecard (supplies, tolls, parking).
// The photo is uploaded straight from the phone to Storage; the server then checks
// each reference before saving it on the timecard, so a technician can only attach
// files from their own folder for the job they are submitting against.

export const MAX_RECEIPTS_PER_ENTRY = 12;
export const MAX_RECEIPT_BYTES = 15 * 1024 * 1024;

/** The Storage folder a technician's receipts for one job must live in. */
export const receiptFolder = (jobId, uid) => `job-receipts/${jobId || 'ad-hoc'}/tech/${uid}/`;

/** Download URLs Firebase hands out begin like this for a given file. */
export const downloadUrlPrefix = (bucket, path) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}`;

const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Keeps only receipt references that point into this technician's folder for
 * this job, with a matching download URL. Duplicates and extras are dropped.
 * Returns plain {name, path, url} objects; the caller confirms each file exists.
 */
export function sanitizeReceiptRefs(input, { jobId, uid, bucket }) {
  if (!Array.isArray(input) || !uid || !bucket) return [];
  const folder = receiptFolder(jobId, uid);
  const seen = new Set();
  const refs = [];
  for (const item of input) {
    const path = text(item?.path, 400);
    const url = text(item?.url, 1200);
    if (!path.startsWith(folder) || path.includes('..') || path.slice(folder.length).includes('/')) continue;
    if (!url.startsWith(downloadUrlPrefix(bucket, path))) continue;
    if (seen.has(path)) continue;
    seen.add(path);
    refs.push({ name: text(item?.name, 120) || path.slice(folder.length), path, url });
    if (refs.length >= MAX_RECEIPTS_PER_ENTRY) break;
  }
  return refs;
}

/** Accepts only real image files within the size limit (metadata comes from Storage). */
export const isAcceptableReceiptFile = (metadata) =>
  Boolean(metadata) && /^image\//i.test(String(metadata.contentType || '')) && Number(metadata.size) > 0 && Number(metadata.size) <= MAX_RECEIPT_BYTES;

/** Existing receipts first, then new ones, no repeats, capped. */
export function mergeReceipts(existing, added) {
  const merged = [];
  const seen = new Set();
  for (const receipt of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(added) ? added : [])]) {
    if (!receipt?.path || seen.has(receipt.path)) continue;
    seen.add(receipt.path);
    merged.push(receipt);
  }
  return merged.slice(0, MAX_RECEIPTS_PER_ENTRY);
}
