import { adminDb } from './firebase-admin.js';
import { hashValue, nowIso, safeEqual } from './client-portal.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const token = String(req.headers['x-goog-channel-token'] || '');
  if (!process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN || !safeEqual(token, process.env.GOOGLE_CALENDAR_WEBHOOK_TOKEN)) return res.status(403).json({ error: 'Invalid channel token.' });
  const channelId = String(req.headers['x-goog-channel-id'] || '');
  await adminDb.collection('calendar_connections').doc(hashValue(channelId)).set({ channelIdHash: hashValue(channelId), resourceId: String(req.headers['x-goog-resource-id'] || ''), resourceState: String(req.headers['x-goog-resource-state'] || ''), syncPending: true, notifiedAt: nowIso() }, { merge: true });
  await adminDb.collection('settings').doc('google_calendar').set({ syncPending: true, notifiedAt: nowIso() }, { merge: true });
  return res.status(200).json({ received: true });
}
