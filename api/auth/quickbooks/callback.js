import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  const { code, realmId, error } = req.query;

  if (error) {
    return res.redirect(`/contractor/dashboard?qbo_connect=error&details=${encodeURIComponent(error)}`);
  }

  if (!code || !realmId) {
    return res.status(400).json({ error: 'Missing code or realmId query parameters.' });
  }

  const clientId = process.env.QBO_CLIENT_ID;
  const clientSecret = process.env.QBO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'QBO client credentials are not configured in environment variables.' });
  }

  const protocol = req.headers.host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${req.headers.host}/api/auth/quickbooks/callback`;

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

    // Load Firebase Config
    const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(firebaseConfigPath)) {
      return res.status(500).json({ error: 'Firebase config file not found.' });
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

    // Initialize Firebase & Firestore
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    // Save tokens in Firestore setting document
    const qboSettingDoc = doc(db, 'settings', 'quickbooks');
    await setDoc(qboSettingDoc, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      realmId,
      accessTokenExpiresAt: Date.now() + (tokenData.expires_in * 1000),
      refreshTokenExpiresAt: Date.now() + (tokenData.x_refresh_token_expires_in * 1000),
      connectedAt: new Date().toISOString(),
      status: 'connected'
    });

    // Redirect user back to the contractor dashboard with a success flag
    return res.redirect(`/contractor/dashboard?qbo_connect=success&realmId=${realmId}`);
  } catch (err) {
    console.error('QBO Callback Exception:', err);
    return res.status(500).json({ error: `Internal Server Error: ${err.message}` });
  }
}
