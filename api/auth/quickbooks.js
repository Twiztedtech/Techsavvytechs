import { randomBytes } from 'crypto';
import { requireAdmin } from '../_lib/firebase-admin.js';
import googleCalendarAuthHandler from '../_lib/google-calendar-auth-handler.js';

export default async function handler(req, res) {
  if (req.query?.authProvider === 'googleCalendar') return googleCalendarAuthHandler(req, res);
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);
    const clientId = process.env.QBO_CLIENT_ID;
    const appUrl = process.env.APP_URL?.replace(/\/$/, '');
    if (!clientId || !appUrl) {
      return res.status(500).json({ error: 'QuickBooks is not configured on the server.' });
    }

    const state = randomBytes(32).toString('hex');
    const secure = appUrl.startsWith('https://') ? '; Secure' : '';
    res.setHeader('Set-Cookie', `qbo_oauth_state=${state}; HttpOnly; SameSite=Lax; Path=/api/auth/quickbooks; Max-Age=600${secure}`);

    const redirectUri = `${appUrl}/api/auth/quickbooks/callback`;
    const url = new URL('https://appcenter.intuit.com/connect/oauth2');
    url.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: redirectUri,
      state,
    }).toString();
    return res.status(200).json({ authorizationUrl: url.toString() });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('QuickBooks authorization start failed:', error);
    return res.status(500).json({ error: 'Could not start the QuickBooks authorization.' });
  }
}
