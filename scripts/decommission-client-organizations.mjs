// Phase 4 of the customers/client_organizations merge: deletes the migrated
// client_organizations docs now that nothing in api/ or src/ reads that
// collection (Phase 3 cut everything over to customers/customerId). The
// mapping file (client-organizations-to-customers-mapping-*.json) stays in
// the repo permanently as the audit trail of what merged into what.
//
//   node scripts/decommission-client-organizations.mjs            (dry run)
//   node scripts/decommission-client-organizations.mjs --apply     (deletes)
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, readdirSync } from 'node:fs';
import { config } from 'dotenv';

config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const mappingFile = readdirSync('scripts').find((f) => f.startsWith('client-organizations-to-customers-mapping-'));
if (!mappingFile) {
  console.error('No mapping file found in scripts/.');
  process.exit(1);
}
const mapping = JSON.parse(readFileSync(`scripts/${mappingFile}`, 'utf8'));
console.log('Using mapping file:', mappingFile);

const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)) });
const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);

const allOrgs = await db.collection('client_organizations').get();
console.log(`\nclient_organizations currently has ${allOrgs.size} doc(s).`);
for (const doc of allOrgs.docs) {
  const inMapping = Object.prototype.hasOwnProperty.call(mapping, doc.id);
  console.log(' ', doc.id, '|', doc.data().name, '| in mapping:', inMapping ? `-> customers/${mapping[doc.id]}` : 'NO - will be skipped, review manually');
}

const toDelete = allOrgs.docs.filter((doc) => Object.prototype.hasOwnProperty.call(mapping, doc.id));
if (!toDelete.length) {
  console.log('\nNothing to delete.');
  process.exit(0);
}

if (!APPLY) {
  console.log(`\nDry run only - would delete ${toDelete.length} doc(s). Re-run with --apply once this looks right.`);
  process.exit(0);
}

const batch = db.batch();
for (const doc of toDelete) batch.delete(doc.ref);
await batch.commit();
console.log(`\nDeleted ${toDelete.length} doc(s) from client_organizations.`);
