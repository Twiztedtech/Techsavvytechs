// Second half of Phase 3 of the customers/client_organizations merge:
// rewrites organizationId -> customerId on client_users, vendor_requests,
// and job_participants, using the mapping file written by
// merge-client-organizations.mjs --apply. Must run BEFORE the code that
// reads/writes customerId instead of organizationId is deployed, otherwise
// existing client accounts lose their company link.
//
//   node scripts/remap-organization-ids.mjs <mapping-file.json>            (dry run)
//   node scripts/remap-organization-ids.mjs <mapping-file.json> --apply     (writes)

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { readFileSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const mappingPath = process.argv[2];
if (!mappingPath || mappingPath === '--apply') {
  console.error('Usage: node scripts/remap-organization-ids.mjs <mapping-file.json> [--apply]');
  process.exit(1);
}
const mapping = JSON.parse(readFileSync(mappingPath, 'utf8'));

const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);

async function processCollection(name) {
  const snapshot = await db.collection(name).get();
  const rows = [];
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (!data.organizationId) continue; // already migrated or never had one
    const newId = mapping[data.organizationId];
    rows.push({ id: doc.id, oldId: data.organizationId, newId, ref: doc.ref });
  }
  console.log(`\n${name}: ${rows.length} doc(s) with an organizationId to remap`);
  for (const row of rows) {
    console.log(' ', row.id, '|', row.oldId, '->', row.newId || 'NO MAPPING FOUND');
  }
  const unmapped = rows.filter((r) => !r.newId);
  if (unmapped.length) {
    console.log(`  ${unmapped.length} row(s) have no mapping entry - these will be skipped, review manually.`);
  }
  if (!APPLY) return { total: rows.length, unmapped: unmapped.length };

  const batch = db.batch();
  let writes = 0;
  for (const row of rows) {
    if (!row.newId) continue;
    batch.update(row.ref, {
      customerId: row.newId,
      organizationId: FieldValue.delete(),
    });
    writes += 1;
  }
  if (writes) await batch.commit();
  return { total: rows.length, unmapped: unmapped.length, written: writes };
}

async function main() {
  const results = {};
  for (const name of ['client_users', 'vendor_requests', 'job_participants']) {
    results[name] = await processCollection(name);
  }
  console.log(APPLY ? '\nApplied.' : '\nDry run only - nothing was written. Re-run with --apply once this looks right.');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
