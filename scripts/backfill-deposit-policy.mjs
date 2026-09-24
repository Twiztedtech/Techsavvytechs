// One-time rollout for the first-job deposit: every existing customer is
// grandfathered as "waived" so no current job blocks a technician, except the
// customers listed in REQUIRED_IDS. Dry run by default; pass --apply to write.
// Customers that already have a depositPolicy are never changed.
import { config } from 'dotenv';
config({ path: '.env.local' });
const { adminDb } = await import('../api/_lib/firebase-admin.js');

const APPLY = process.argv.includes('--apply');
const REQUIRED_IDS = new Set(['G5cgKFAhdO0nOWKesVPP']); // Atech Technologies Inc

const snapshot = await adminDb.collection('customers').get();
const plan = snapshot.docs.map((doc) => {
  const data = doc.data();
  const current = data.depositPolicy || '';
  const target = REQUIRED_IDS.has(doc.id) ? 'required' : 'waived';
  return { id: doc.id, name: data.name, current, target, change: !current };
});
console.table(plan.map(({ id, name, current, target, change }) => ({ id, name, current: current || '(unset)', target, action: change ? 'SET' : 'keep' })));
const toChange = plan.filter((row) => row.change);
console.log(`${toChange.length} of ${plan.length} customers will be updated (${toChange.filter((r) => r.target === 'required').length} required, ${toChange.filter((r) => r.target === 'waived').length} waived).`);

if (!APPLY) {
  console.log('Dry run only. Re-run with --apply to write.');
  process.exit(0);
}
for (const row of toChange) {
  await adminDb.collection('customers').doc(row.id).set({ depositPolicy: row.target }, { merge: true });
}
console.log('Applied.');
process.exit(0);
