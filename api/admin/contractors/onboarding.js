import { adminDb, adminStorage, requireAdmin } from '../../lib/firebase-admin.js';

const REVIEW_STATUSES = new Set(['approved', 'needs_update']);

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed.' });
  try {
    await requireAdmin(req);
    if (req.method === 'GET') {
      const contractorId = typeof req.query.contractorId === 'string' ? req.query.contractorId : '';
      if (!contractorId) return res.status(400).json({ error: 'A contractor is required.' });
      const contractor = await adminDb.collection('contractors').doc(contractorId).get();
      const storagePath = contractor.data()?.onboarding?.w9?.storagePath;
      if (!contractor.exists || typeof storagePath !== 'string' || !storagePath.startsWith('contractor-onboarding/')) {
        return res.status(404).json({ error: 'No submitted W-9 was found for this contractor.' });
      }
      const [url] = await adminStorage.file(storagePath).getSignedUrl({
        action: 'read',
        version: 'v4',
        expires: Date.now() + 5 * 60 * 1000,
      });
      return res.status(200).json({ url, expiresInSeconds: 300 });
    }

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
