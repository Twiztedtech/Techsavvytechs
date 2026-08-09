import { adminDb, requireAdmin } from '../../_lib/firebase-admin.js';
import { qboEnvironment } from '../../_lib/quickbooks-config.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
    const snapshot = await adminDb.collection('settings').doc('quickbooks').get();
    const data = snapshot.data();
    return res.status(200).json({
      connected: data?.status === 'connected',
      realmId: data?.realmId || null,
      environment: data?.environment || null,
      configuredEnvironment: qboEnvironment,
    });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('QuickBooks status check failed:', error);
    return res.status(500).json({ error: 'QuickBooks status could not be loaded.' });
  }
}
