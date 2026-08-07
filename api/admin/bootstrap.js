import { adminAuth } from '../lib/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication required.' });

  try {
    const user = await adminAuth.verifyIdToken(token);
    if (user.email !== process.env.INITIAL_ADMIN_EMAIL) return res.status(403).json({ error: 'Not the configured administrator.' });
    await adminAuth.setCustomUserClaims(user.uid, { admin: true, contractor: true });
    return res.status(200).json({ success: true, message: 'Administrator and Contractor roles applied. Sign out and sign back in.' });
  } catch (error) {
    return res.status(500).json({ error: 'Unable to bootstrap administrator access.' });
  }
}
