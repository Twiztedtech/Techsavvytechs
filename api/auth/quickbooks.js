export default function handler(req, res) {
  const clientId = process.env.QBO_CLIENT_ID;
  
  if (!clientId) {
    return res.status(500).json({ error: 'QBO_CLIENT_ID is not configured in environment variables.' });
  }

  // Determine redirect URI dynamically based on request host
  const protocol = req.headers.host.includes('localhost') ? 'http' : 'https';
  const redirectUri = `${protocol}://${req.headers.host}/api/auth/quickbooks/callback`;
  
  const scopes = 'com.intuit.quickbooks.accounting';
  const state = 'qbo-auth';

  const authUrl = 'https://appcenter.intuit.com/connect/oauth2';
  const url = `${authUrl}?client_id=${clientId}&response_type=code&scope=${encodeURIComponent(scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return res.redirect(url);
}
