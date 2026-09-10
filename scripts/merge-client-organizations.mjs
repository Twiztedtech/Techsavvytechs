// One-time migration script (Phase 2 of the customers/client_organizations
// merge plan) - merges existing client_organizations documents into the CRM
// customers collection, which was chosen as the surviving canonical record.
//
// SAFE BY DEFAULT: runs as a dry run (reads only, writes nothing) unless
// called with --apply. Always run without --apply first and review the
// output before ever passing --apply.
//
//   node scripts/merge-client-organizations.mjs            (dry run)
//   node scripts/merge-client-organizations.mjs --apply     (writes)
//
// Does NOT touch client_users, vendor_requests, job_participants, or
// jobs.clientOrganizationId - that remap is Phase 3, done in application
// code (not this script) using the mapping file this script writes out.

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';
import { config } from 'dotenv';

// Matches the existing one-off admin scripts (retry_sync.cjs, etc.), which
// load .env.local rather than the default .env - .env.local is where the
// real production service account/database id live in this repo.
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not set (check .env.local).');
  process.exit(1);
}
const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore(app, process.env.FIRESTORE_DATABASE_ID);

const normalizeName = (value) => String(value || '').trim().toLowerCase();

async function main() {
  const [orgsSnap, customersSnap] = await Promise.all([
    db.collection('client_organizations').get(),
    db.collection('customers').get(),
  ]);

  const orgs = orgsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const customers = customersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

  console.log(`\nFound ${orgs.length} client_organizations record(s) and ${customers.length} customers record(s).\n`);

  const byName = new Map();
  for (const customer of customers) {
    const key = normalizeName(customer.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(customer);
  }

  const rows = [];
  let ambiguousCount = 0;
  for (const org of orgs) {
    const key = normalizeName(org.name);
    const matches = byName.get(key) || [];
    if (matches.length > 1) {
      ambiguousCount += 1;
      rows.push({ org, matches, status: 'AMBIGUOUS' });
    } else if (matches.length === 1) {
      rows.push({ org, matches, status: 'MATCH' });
    } else {
      rows.push({ org, matches: [], status: 'NO MATCH (will create new customer)' });
    }
  }

  console.log('client_organizations name'.padEnd(38), 'status'.padEnd(38), 'matched customers id(s)');
  console.log('-'.repeat(110));
  for (const row of rows) {
    const matchIds = row.matches.map((m) => m.id).join(', ') || '-';
    console.log(
      `"${row.org.name || '(no name)'}"`.padEnd(38),
      row.status.padEnd(38),
      matchIds,
    );
  }
  console.log('-'.repeat(110));
  console.log(`\n${rows.filter((r) => r.status === 'MATCH').length} match(es), ${rows.filter((r) => r.status.startsWith('NO MATCH')).length} to create, ${ambiguousCount} ambiguous.\n`);

  if (ambiguousCount > 0) {
    console.log('AMBIGUOUS rows must be resolved by hand before running --apply (rename one of the');
    console.log('duplicate customers records, or merge them, so each org name matches at most one customer).\n');
  }

  if (!APPLY) {
    console.log('Dry run only - nothing was written. Re-run with --apply once this output looks right.\n');
    return;
  }

  if (ambiguousCount > 0) {
    console.error('Refusing to apply: resolve the ambiguous name matches first.');
    process.exit(1);
  }

  const mapping = {};
  const batch = db.batch();
  let writes = 0;
  for (const row of rows) {
    const fieldsToCarry = {
      personnel: row.org.personnel || [],
      billingRecipientEmails: row.org.billingRecipientEmails || [],
      approvedDomains: row.org.approvedDomains || [],
      referencePrefixes: row.org.referencePrefixes || [],
      defaultContactPolicy: row.org.defaultContactPolicy || 'techsavvy_only',
    };
    if (row.status === 'MATCH') {
      const targetId = row.matches[0].id;
      batch.set(db.collection('customers').doc(targetId), fieldsToCarry, { merge: true });
      mapping[row.org.id] = targetId;
    } else {
      const newRef = db.collection('customers').doc();
      batch.set(newRef, {
        name: row.org.name || '',
        contact: '',
        email: '',
        phone: '',
        sites: [],
        assets: 0,
        lifetimeValue: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...fieldsToCarry,
      });
      mapping[row.org.id] = newRef.id;
    }
    writes += 1;
    if (writes % 400 === 0) await batch.commit();
  }
  await batch.commit();

  const mappingPath = `scripts/client-organizations-to-customers-mapping-${Date.now()}.json`;
  writeFileSync(mappingPath, JSON.stringify(mapping, null, 2));
  console.log(`Applied. Wrote ${Object.keys(mapping).length} mapping entries to ${mappingPath}.`);
  console.log('client_organizations documents were NOT deleted - Phase 3/4 handle cutover and cleanup.\n');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
