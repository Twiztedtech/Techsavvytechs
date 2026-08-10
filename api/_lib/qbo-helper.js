import { adminDb } from './firebase-admin.js';
import { qboCompanyBaseUrl, qboEnvironment } from './quickbooks-config.js';

/**
 * Ensures we have a valid access token for QBO and returns it along with realmId
 */
export async function getValidQboToken() {
  const qboSettingDoc = adminDb.collection('settings').doc('quickbooks');
  const qboSnap = await qboSettingDoc.get();
  if (!qboSnap.exists) {
    throw new Error('QuickBooks is not connected.');
  }

  const qboData = qboSnap.data();
  let accessToken = qboData?.accessToken;
  const realmId = qboData?.realmId;

  if (!accessToken || !realmId) {
    throw new Error('QuickBooks settings are missing access token or Realm ID.');
  }

  // Refresh token if expired or about to expire (within 60 seconds)
  if (qboData.accessTokenExpiresAt && Date.now() >= qboData.accessTokenExpiresAt - 60_000) {
    const { QBO_CLIENT_ID: clientId, QBO_CLIENT_SECRET: clientSecret } = process.env;
    if (!clientId || !clientSecret || !qboData.refreshToken) {
      throw new Error('QuickBooks authorization needs to be renewed.');
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
      throw new Error('QuickBooks token refresh failed: ' + await refreshResponse.text());
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

  return { accessToken, realmId };
}

/**
 * Resolves a QBO Vendor ID by email, or creates a new Vendor in QBO if not found
 */
export async function getOrCreateVendor(name, email) {
  console.log('[DEBUG getOrCreateVendor] Called with name:', name, 'email:', email);
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);

  // 1. Query Vendor by DisplayName (PrimaryEmailAddr is not queryable in QBO)
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(`select * from Vendor where DisplayName = '${escapedName}'`);
  const queryUrl = `${baseUrl}/query?query=${query}`;

  const searchRes = await fetch(queryUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
  });

  if (!searchRes.ok) {
    throw new Error('Failed to search vendor in QBO: ' + await searchRes.text());
  }

  const searchData = await searchRes.json();
  const vendors = searchData.QueryResponse?.Vendor;
  if (vendors && vendors.length > 0) {
    return vendors[0].Id;
  }

  // 2. Create Vendor if not found
  const createUrl = `${baseUrl}/vendor`;
  const vendorPayload = {
    DisplayName: name,
    PrimaryEmailAddr: { Address: email }
  };

  try {
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(vendorPayload)
    });

    if (createRes.ok) {
      const createData = await createRes.json();
      return createData.Vendor.Id;
    }

    const errorText = await createRes.text();
    let errorObj = null;
    try {
      errorObj = JSON.parse(errorText);
    } catch (_) {}

    const code = errorObj?.Fault?.Error?.[0]?.code;
    if (code === '6240') {
      // Duplicate Name Error: retry with " (Contractor)" suffix
      const fallbackPayload = {
        DisplayName: `${name} (Contractor)`,
        PrimaryEmailAddr: { Address: email }
      };

      const retryRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(fallbackPayload)
      });

      if (!retryRes.ok) {
        throw new Error('Failed to create vendor in QBO after duplicate retry: ' + await retryRes.text());
      }

      const retryData = await retryRes.json();
      return retryData.Vendor.Id;
    }

    throw new Error('Failed to create vendor in QBO: ' + errorText);
  } catch (err) {
    throw err;
  }
}

/**
 * Creates a Vendor Bill in QBO for an Approved Timecard
 */
export async function createQBOBillForTimecard(timecard, payoutDueDate) {
  console.log('[DEBUG createQBOBillForTimecard] Called with timecard payload:', JSON.stringify(timecard, null, 2));
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);

  // Resolve QBO Vendor ID
  const vendorId = await getOrCreateVendor(timecard.technicianName, timecard.technicianEmail);

  const promises = [];
  let laborPromiseIdx = -1;
  let expensePromiseIdx = -1;

  // 1. Labor -> TimeActivity
  const decimalHours = Number(timecard.totalHours || 0);
  const laborRate = Number(timecard.rate || 75);
  if (timecard.laborStatus === 'approved' && decimalHours > 0) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    const timeActivityPayload = {
      NameOf: 'Vendor',
      VendorRef: { value: vendorId },
      TxnDate: timecard.date,
      Hours: hours,
      Minutes: minutes,
      HourlyRate: laborRate,
      Description: `Labor: ${timecard.totalHours} hrs @ $${laborRate}/hr (${timecard.jobSite})`
    };

    const timeActivityUrl = `${baseUrl}/timeactivity`;
    const timePromise = fetch(timeActivityUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(timeActivityPayload)
    }).then(async res => {
      if (!res.ok) {
        throw new Error('Failed to create TimeActivity in QBO: ' + await res.text());
      }
      return res.json();
    });

    laborPromiseIdx = promises.length;
    promises.push(timePromise);
  }

  // 2. Expenses (Supplies / Travel) -> Bill
  const supplies = Number(timecard.suppliesCost || 0);
  const travel = Number(timecard.travelCost || 0);

  const expenseLines = [];
  if (timecard.suppliesStatus === 'approved' && supplies > 0) {
    expenseLines.push({
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: supplies,
      Description: `Supplies Reimbursement (${timecard.jobSite})`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: process.env.QBO_EXPENSE_ACCOUNT_SUPPLIES || '81' }
      }
    });
  }

  if (timecard.travelStatus === 'approved' && travel > 0) {
    expenseLines.push({
      DetailType: 'AccountBasedExpenseLineDetail',
      Amount: travel,
      Description: `Travel Expense (${timecard.jobSite})`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: process.env.QBO_EXPENSE_ACCOUNT_TRAVEL || '82' }
      }
    });
  }

  if (expenseLines.length > 0) {
    const billPayload = {
      VendorRef: { value: vendorId },
      TxnDate: timecard.date,
      DueDate: payoutDueDate.toISOString().split('T')[0],
      PrivateNote: `TechSavvyTechs Approval ID: ${timecard.id}`,
      Line: expenseLines
    };

    const billUrl = `${baseUrl}/bill`;
    const billPromise = fetch(billUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(billPayload)
    }).then(async res => {
      if (!res.ok) {
        throw new Error('Failed to create Bill in QBO: ' + await res.text());
      }
      return res.json();
    });

    expensePromiseIdx = promises.length;
    promises.push(billPromise);
  }

  // Wait for both to complete
  const results = await Promise.all(promises);

  const responseObj = {};
  if (laborPromiseIdx !== -1) {
    responseObj.TimeActivity = results[laborPromiseIdx].TimeActivity;
  }
  if (expensePromiseIdx !== -1) {
    responseObj.Bill = results[expensePromiseIdx].Bill;
  }

  return responseObj;
}
