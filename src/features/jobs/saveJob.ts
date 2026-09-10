import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { buildJobRecord, type SaveJobInput } from './buildJobRecord';

// The three places that used to create/update a job (ContractorDashboard's
// Job Sites form, CRM's quote-to-job conversion, CRM's quick-create form)
// each hand-built the Firestore object, so a job created through either CRM
// path was silently missing hourlyRate/signatureRequired/qaChecklist/etc -
// fields the technician-completion flow (api/portal/time-clock.js) depends
// on for correct pay and signature enforcement. Every job write now goes
// through this function so the full field set is always present, with the
// same defaults ContractorDashboard's form already used.
export type { SaveJobInput };

export async function saveJob(
  input: SaveJobInput,
  existingJob?: Record<string, unknown> | null,
): Promise<Record<string, unknown> & { id: string }> {
  const job = buildJobRecord(input, existingJob, new Date().toISOString());
  if (input.id) {
    await setDoc(doc(db, 'jobs', input.id), job);
    return { id: input.id, ...job };
  }
  const created = await addDoc(collection(db, 'jobs'), job);
  return { id: created.id, ...job };
}
