import { adminDb, adminStorage, requireAdmin } from '../../lib/firebase-admin.js';

// W-9 files are accessed through a short-lived signed URL so a permanent
// Firebase download token is never handed to the browser.
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    await requireAdmin(req);
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
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('Contractor W-9 download failed:', error);
    return res.status(500).json({ error: 'Could not prepare this W-9 for review.' });
  }
}
