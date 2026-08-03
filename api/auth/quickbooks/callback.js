import { adminDb } from '../../lib/firebase-admin.js';
import { qboEnvironment } from '../../lib/quickbooks-config.js';

export default async function handler(req, res) {
  const { code, realmId, error, state } = req.query;

  if (error) {
    return res.redirect(`/contractor/dashboard?qbo_connect=error&details=${encodeURIComponent(error)}`);
  }

  const expectedState = req.headers.cookie
    ?.split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('qbo_oauth_state='))
    ?.slice('qbo_oauth_state='.length);

  if (!code || !realmId || !state || state !== expectedState) {
    return res.status(400).json({ error: 'QuickBooks authorization could not be verified. Please start the connection again.' });
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'QBO client credentials are not configured in environment variables.' });
  }

  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  if (!appUrl) {
    return res.status(500).json({ error: 'APP_URL is not configured on the server.' });
  }
  const redirectUri = `${appUrl}/api/auth/quickbooks/callback`;

  try {
    // Exchange Auth Code for Access/Refresh Tokens
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      }).toString()
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      return res.status(tokenResponse.status).json({ error: `Failed to exchange auth code: ${errorText}` });
    }

    const tokenData = await tokenResponse.json();

    await adminDb.collection('settings').doc('quickbooks').set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      realmId,
      accessTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
      refreshTokenExpiresAt: Date.now() + (tokenData.x_refresh_token_expires_in * 1000),
      environment: qboEnvironment,
      connectedAt: new Date().toISOString(),
      status: 'connected'
    });
    res.setHeader('Set-Cookie', 'qbo_oauth_state=; HttpOnly; SameSite=Lax; Path=/api/auth/quickbooks; Max-Age=0; Secure');

    // Redirect user back to the contractor dashboard with a success flag
    return res.redirect(`/contractor/dashboard?qbo_connect=success&realmId=${realmId}`);
  } catch (err) {
    console.error('QBO Callback Exception:', err);
    return res.status(500).json({ error: 'QuickBooks connection could not be completed.' });
  }
}
