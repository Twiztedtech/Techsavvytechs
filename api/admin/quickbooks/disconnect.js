import { adminDb, requireAdmin } from '../../lib/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
    await adminDb.collection('settings').doc('quickbooks').delete();
    return res.status(200).json({ success: true });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('QuickBooks disconnect failed:', error);
    return res.status(500).json({ error: 'QuickBooks could not be disconnected.' });
  }
}
