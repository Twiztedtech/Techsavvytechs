import { createHmac } from 'node:crypto';
import { adminDb, requireAdmin } from '../_lib/firebase-admin.js';
import { clean, encryptSecret, nowIso, renewGoogleCalendarWatch, safeEqual } from '../_lib/client-portal.js';

const appUrl = () => (process.env.APP_URL || 'https://techsavvytechs.com').replace(/\/$/, '');
const redirectUri = () => `${appUrl()}/api/auth/google-calendar?action=callback`;
const signedState = (uid, expires) => {
  const value = `${uid}.${expires}`;
  const signature = createHmac('sha256', process.env.CLIENT_PORTAL_SECRET || '').update(value).digest('base64url');
  return `${value}.${signature}`;
};

function verifyState(state) {
  const [uid, expires, signature] = String(state || '').split('.');
  if (!uid || !expires || Number(expires) < Date.now()) return null;
  const expected = createHmac('sha256', process.env.CLIENT_PORTAL_SECRET || '').update(`${uid}.${expires}`).digest('base64url');
  return safeEqual(signature, expected) ? uid : null;
}

export default async function handler(req, res) {
  try {
    const action = clean(req.query?.action, 30);
    if (req.method === 'POST' && action === 'start') {
      const admin = await requireAdmin(req);
      if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || !process.env.CLIENT_PORTAL_SECRET) return res.status(503).json({ error: 'Google Calendar OAuth is not configured.' });
      const state = signedState(admin.uid, Date.now() + 10 * 60 * 1000);
      const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      url.searchParams.set('client_id', process.env.GOOGLE_CALENDAR_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri());
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events');
      url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); url.searchParams.set('state', state);
      return res.status(200).json({ url: url.toString() });
    }
    if (req.method === 'GET' && action === 'callback') {
      const uid = verifyState(req.query?.state);
      if (!uid) return res.status(403).send('Invalid or expired calendar authorization state.');
      const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: clean(req.query?.code, 1000), client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID, client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET, redirect_uri: redirectUri(), grant_type: 'authorization_code' }) });
      const data = await response.json();
      if (!response.ok || !data.refresh_token) return res.status(502).send('Google Calendar did not return a reusable authorization.');
      await adminDb.collection('settings').doc('google_calendar').set({ encryptedRefreshToken: encryptSecret(data.refresh_token), connectedAt: nowIso(), connectedByUid: uid, status: 'connected' }, { merge: true });
      await renewGoogleCalendarWatch();
      return res.redirect(302, `${appUrl()}/contractor/dashboard?adminTab=requests&calendar=connected`);
    }
    return res.status(404).json({ error: 'Calendar operation not found.' });
  } catch (error) {
    console.error('Google Calendar OAuth error:', error);
    return res.status(500).json({ error: 'Google Calendar authorization failed.' });
  }
}
