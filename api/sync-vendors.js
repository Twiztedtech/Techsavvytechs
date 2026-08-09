import { adminDb, requireAdmin } from './_lib/firebase-admin.js';
import { qboCompanyBaseUrl, qboEnvironment } from './_lib/quickbooks-config.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await requireAdmin(req);

    const qboSettingDoc = adminDb.collection('settings').doc('quickbooks');
    const qboSnap = await qboSettingDoc.get();
    const qboData = qboSnap.data();

    if (qboData && qboData.environment !== qboEnvironment) {
      return res.status(409).json({
        error: `QuickBooks is connected to ${qboData.environment || 'an older, unknown'} environment. Disconnect it and reconnect to ${qboEnvironment}.`,
      });
    }
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

    const baseUrl = qboCompanyBaseUrl(realmId);
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
    const liveVendorDocumentIds = new Set();

    for (const vendor of vendors) {
      const email = vendor.PrimaryEmailAddr?.Address?.toLowerCase();
      if (!email) continue;

      const id = vendor.Id;
      const contractorId = `qbo-${id}`;
      const name = vendor.DisplayName || vendor.CompanyName || `${vendor.GivenName || ''} ${vendor.FamilyName || ''}`.trim();
      
      // Look for any existing manual contractor profile with the same email
      const existingQuery = await adminDb.collection('contractors')
        .where('email', '==', email)
        .get();

      let targetDocRef = adminDb.collection('contractors').doc(contractorId);
      
      if (!existingQuery.empty) {
        // If we find a manually added record (ID does not start with 'qbo-'), we update that record instead
        const manualDoc = existingQuery.docs.find(doc => !doc.id.startsWith('qbo-'));
        if (manualDoc) {
          targetDocRef = manualDoc.ref;
        }
      }

      liveVendorDocumentIds.add(targetDocRef.id);
      
      await targetDocRef.set({
        id: targetDocRef.id,
        name,
        email,
        rate: vendor.HourlyRate ? Number(vendor.HourlyRate) : 75,
        status: vendor.Active ? 'Active' : 'Pending',
        qboVendorId: id,
        syncedAt: new Date().toISOString(),
      }, { merge: true });
      
      syncCount += 1;
    }

    // Remove portal records created by an earlier QuickBooks connection (for
    // example, the sandbox company) after the live vendor list has been fully
    // written. Only auto-created qbo-* records are eligible; manual contractor
    // profiles are left untouched.
    const existingContractors = await adminDb.collection('contractors').get();
    const staleVendorDocs = existingContractors.docs.filter((doc) => (
      doc.id.startsWith('qbo-') && !liveVendorDocumentIds.has(doc.id)
    ));

    for (let index = 0; index < staleVendorDocs.length; index += 450) {
      const batch = adminDb.batch();
      staleVendorDocs.slice(index, index + 450).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    return res.status(200).json({
      success: true,
      message: `Successfully synced ${syncCount} contractors and removed ${staleVendorDocs.length} obsolete QuickBooks records.`,
    });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('QuickBooks vendor sync failed:', error);
    return res.status(500).json({ error: 'Vendor sync failed. Please try again.' });
  }
}
