import { adminDb, requireAdmin } from '../../lib/firebase-admin.js';

const REVIEW_STATUSES = new Set(['approved', 'needs_update']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    await requireAdmin(req);
    const contractorId = typeof req.body?.contractorId === 'string' ? req.body.contractorId : '';
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    const reviewNote = typeof req.body?.reviewNote === 'string' ? req.body.reviewNote.trim().slice(0, 1000) : '';
    if (!contractorId || !REVIEW_STATUSES.has(status)) return res.status(400).json({ error: 'A contractor and valid review status are required.' });

    const ref = adminDb.collection('contractors').doc(contractorId);
    const snapshot = await ref.get();
    if (!snapshot.exists || !snapshot.data()?.onboarding?.w9?.storagePath) return res.status(404).json({ error: 'No submitted W-9 was found for this contractor.' });

    await ref.set({ onboarding: { ...snapshot.data().onboarding, status, reviewedAt: new Date().toISOString(), reviewNote } }, { merge: true });
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') return res.status(403).json({ error: error.message });
    console.error('Contractor onboarding review failed:', error);
    return res.status(500).json({ error: 'Could not save the onboarding review.' });
  }
}
