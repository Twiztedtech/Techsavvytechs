import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  // Only allow POST or GET for simplicity
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isSandbox = true; // Set to false for production QBO API

  try {
    // Load Firebase Config
    const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(firebaseConfigPath)) {
      return res.status(500).json({ error: 'Firebase config file not found.' });
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

    // Initialize Firebase & Firestore
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

    // Fetch dynamic tokens from Firestore
    let accessToken = process.env.QBO_ACCESS_TOKEN;
    let realmId = process.env.QBO_REALM_ID;
    let usingDatabaseCredentials = false;

    try {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const qboSettingDoc = doc(db, 'settings', 'quickbooks');
      const qboSnap = await getDoc(qboSettingDoc);
      
      if (qboSnap.exists() && qboSnap.data().status === 'connected') {
        const qboData = qboSnap.data();
        accessToken = qboData.accessToken;
        realmId = qboData.realmId;
        usingDatabaseCredentials = true;

        // Auto-refresh token if it expires in less than 60 seconds
        if (qboData.accessTokenExpiresAt && Date.now() >= qboData.accessTokenExpiresAt - 60000) {
          const clientId = process.env.QBO_CLIENT_ID;
          const clientSecret = process.env.QBO_CLIENT_SECRET;

          if (clientId && clientSecret && qboData.refreshToken) {
            console.log('QBO token expired. Refreshing token...');
            const refreshResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
              },
              body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: qboData.refreshToken
              }).toString()
            });

            if (refreshResponse.ok) {
              const refreshData = await refreshResponse.json();
              accessToken = refreshData.access_token;
              
              await updateDoc(qboSettingDoc, {
                accessToken: refreshData.access_token,
                refreshToken: refreshData.refresh_token,
                accessTokenExpiresAt: Date.now() + (refreshData.expires_in * 1000),
                refreshTokenExpiresAt: Date.now() + (refreshData.x_refresh_token_expires_in * 1000)
              });
              console.log('QBO token refreshed successfully.');
            } else {
              console.error('Failed to refresh QBO token:', await refreshResponse.text());
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn('Error reading QBO credentials from Firestore. Falling back to env variables:', dbErr);
    }

    if (!accessToken || !realmId) {
      return res.status(401).json({ 
        error: 'QuickBooks is not connected. Please click "Connect to QuickBooks" in the Admin panel.' 
      });
    }

    const qboBaseUrl = isSandbox
      ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
      : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

    // Query QBO Vendors
    const query = encodeURIComponent("select * from Vendor maxresults 500");
    const response = await fetch(`${qboBaseUrl}/query?query=${query}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/text'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `QBO API error: ${errorText}` });
    }

    const data = await response.json();
    const vendors = data.QueryResponse.Vendor || [];

    let syncCount = 0;
    for (const vendor of vendors) {
      const id = vendor.Id;
      const name = vendor.DisplayName || vendor.CompanyName || `${vendor.GivenName || ''} ${vendor.FamilyName || ''}`.trim();
      const email = vendor.PrimaryEmailAddr ? vendor.PrimaryEmailAddr.Address : '';
      const rate = vendor.HourlyRate ? Number(vendor.HourlyRate) : 75.00;
      const status = vendor.Active ? 'Active' : 'Pending';

      if (!email) continue;

      const contractorData = {
        id: `qbo-${id}`,
        name,
        email: email.toLowerCase(),
        rate,
        status,
        qboVendorId: id,
        syncedAt: new Date().toISOString()
      };

      const docRef = doc(db, 'contractors', contractorData.id);
      await setDoc(docRef, contractorData, { merge: true });
      syncCount++;
    }

    return res.status(200).json({ 
      success: true, 
      message: `Successfully synced ${syncCount} contractors.` 
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Sync failed.' });
  }
}
