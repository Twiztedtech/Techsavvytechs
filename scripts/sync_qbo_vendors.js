const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { initializeApp } = require('firebase/app');
const { getFirestore, collection, doc, setDoc } = require('firebase/firestore');

// Load environment variables
dotenv.config();

// Load Firebase Config
const firebaseConfigPath = path.join(__dirname, '..', 'firebase-applet-config.json');
if (!fs.existsSync(firebaseConfigPath)) {
  console.error('Firebase config file not found at:', firebaseConfigPath);
  process.exit(1);
}
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// QuickBooks Config
const accessToken = process.env.QBO_ACCESS_TOKEN;
const realmId = process.env.QBO_REALM_ID;
const isSandbox = true; // Set to false for production QBO API

const qboBaseUrl = isSandbox
  ? `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
  : `https://quickbooks.api.intuit.com/v3/company/${realmId}`;

async function syncQboVendors() {
  if (!accessToken || !realmId) {
    console.error('Error: QBO_ACCESS_TOKEN and QBO_REALM_ID must be set in your .env file.');
    process.exit(1);
  }

  console.log('Initiating sync from QuickBooks Online...');
  console.log(`Company Realm ID: ${realmId}`);

  try {
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
      throw new Error(`QBO API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const vendors = data.QueryResponse.Vendor || [];

    console.log(`Fetched ${vendors.length} vendors from QuickBooks.`);

    let syncCount = 0;
    for (const vendor of vendors) {
      // Extract vendor details
      const id = vendor.Id;
      const name = vendor.DisplayName || vendor.CompanyName || `${vendor.GivenName || ''} ${vendor.FamilyName || ''}`.trim();
      const email = vendor.PrimaryEmailAddr ? vendor.PrimaryEmailAddr.Address : '';
      
      // Determine rate (default to 75 if not specified in vendor billing details)
      const rate = vendor.HourlyRate ? Number(vendor.HourlyRate) : 75.00;
      const status = vendor.Active ? 'Active' : 'Pending';

      // Skip vendors without emails as we match by email
      if (!email) {
        console.log(`Skipping vendor "${name}" (ID: ${id}) because they have no email address configured.`);
        continue;
      }

      const contractorData = {
        id: `qbo-${id}`,
        name,
        email: email.toLowerCase(),
        rate,
        status,
        qboVendorId: id,
        syncedAt: new Date().toISOString()
      };

      // Write/merge to Firestore contractors collection
      const docRef = doc(db, 'contractors', contractorData.id);
      await setDoc(docRef, contractorData, { merge: true });
      
      console.log(`Synced contractor: ${name} (${email}) -> Firestore ID: ${contractorData.id}`);
      syncCount++;
    }

    console.log(`Successfully completed sync! ${syncCount} contractors updated in Firestore.`);
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  }
}

syncQboVendors();
