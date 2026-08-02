import fs from 'fs';
import path from 'path';
import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

export default async function handler(req, res) {
  // Only allow POST or GET for simplicity
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // QuickBooks Config
  const accessToken = process.env.QBO_ACCESS_TOKEN;
  const realmId = process.env.QBO_REALM_ID;
  const isSandbox = true; // Set to false for production QBO API

  if (!accessToken || !realmId) {
    return res.status(500).json({ 
      error: 'QBO_ACCESS_TOKEN and QBO_REALM_ID environment variables must be configured.' 
    });
  }

  const qboBaseUrl = isSandbox
    ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
    : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

  try {
    // Load Firebase Config
    const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (!fs.existsSync(firebaseConfigPath)) {
      return res.status(500).json({ error: 'Firebase config file not found.' });
    }
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

    // Initialize Firebase
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

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
