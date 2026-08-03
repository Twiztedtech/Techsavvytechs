import { adminDb, requireAdmin } from './lib/firebase-admin.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);

    const qboSettingDoc = adminDb.collection('settings').doc('quickbooks');
    const qboSnap = await qboSettingDoc.get();
    const qboData = qboSnap.data();
    let accessToken = qboData?.accessToken || process.env.QBO_ACCESS_TOKEN;
    const realmId = qboData?.realmId || process.env.QBO_REALM_ID;

    if (!accessToken || !realmId) {
      return res.status(401).json({
        error: 'QuickBooks is not connected. Please connect it from the administrator panel.',
      });
    }

    if (qboData?.accessTokenExpiresAt && Date.now() >= qboData.accessTokenExpiresAt - 60_000) {
      const { QBO_CLIENT_ID: clientId, QBO_CLIENT_SECRET: clientSecret } = process.env;
      if (!clientId || !clientSecret || !qboData.refreshToken) {
        return res.status(401).json({ error: 'QuickBooks authorization needs to be renewed.' });
      }

      const refreshResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: qboData.refreshToken,
        }).toString(),
      });

      if (!refreshResponse.ok) {
        console.error('QuickBooks token refresh failed:', await refreshResponse.text());
        return res.status(401).json({ error: 'QuickBooks authorization needs to be renewed.' });
      }

      const refreshData = await refreshResponse.json();
      accessToken = refreshData.access_token;
      await qboSettingDoc.update({
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token,
        accessTokenExpiresAt: Date.now() + refreshData.expires_in * 1000,
        refreshTokenExpiresAt: Date.now() + refreshData.x_refresh_token_expires_in * 1000,
      });
    }

    const baseUrl = process.env.QBO_ENVIRONMENT === 'production'
      ? `https://quickbooks.api.intuit.com/v3/company/${realmId}`
      : `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`;
    const query = encodeURIComponent('select * from Vendor maxresults 500');
    const response = await fetch(`${baseUrl}/query?query=${query}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error('QuickBooks vendor query failed:', response.status, await response.text());
      return res.status(502).json({ error: 'QuickBooks could not complete the vendor sync.' });
    }

    const data = await response.json();
    const vendors = data.QueryResponse?.Vendor || [];
    let syncCount = 0;

    for (const vendor of vendors) {
      const email = vendor.PrimaryEmailAddr?.Address?.toLowerCase();
      if (!email) continue;

      const id = vendor.Id;
      const name = vendor.DisplayName || vendor.CompanyName || `${vendor.GivenName || ''} ${vendor.FamilyName || ''}`.trim();
      await adminDb.collection('contractors').doc(`qbo-${id}`).set({
        id: `qbo-${id}`,
        name,
        email,
        rate: vendor.HourlyRate ? Number(vendor.HourlyRate) : 75,
        status: vendor.Active ? 'Active' : 'Pending',
        qboVendorId: id,
        syncedAt: new Date().toISOString(),
      }, { merge: true });
      syncCount += 1;
    }

    return res.status(200).json({ success: true, message: `Successfully synced ${syncCount} contractors.` });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('QuickBooks vendor sync failed:', error);
    return res.status(500).json({ error: 'Vendor sync failed. Please try again.' });
  }
}
