import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./firebase-admin.js";
import { qboCompanyBaseUrl, qboEnvironment } from "./quickbooks-config.js";
import { encryptSecret, decryptSecret } from "./client-portal.js";

// QuickBooks access/refresh tokens are stored encrypted (AES-256-GCM) at rest,
// matching the Google Calendar refresh-token pattern. Older connections may
// still have plaintext accessToken/refreshToken fields from before this was
// added; those are read as a fallback and upgraded to encrypted fields the
// next time the token is refreshed.
export function readQboTokens(qboData) {
  const accessToken = qboData?.encryptedAccessToken
    ? decryptSecret(qboData.encryptedAccessToken)
    : qboData?.accessToken || "";
  const refreshToken = qboData?.encryptedRefreshToken
    ? decryptSecret(qboData.encryptedRefreshToken)
    : qboData?.refreshToken || "";
  return { accessToken, refreshToken };
}

// For a full (non-merge) `.set()`, such as the initial OAuth connect — the
// legacy plaintext fields are simply absent from the replaced document.
export function encryptedQboTokenFields({ accessToken, refreshToken }) {
  return {
    encryptedAccessToken: encryptSecret(accessToken),
    encryptedRefreshToken: encryptSecret(refreshToken),
  };
}

// For `.update()`/merge writes, such as a token refresh — also clears any
// leftover legacy plaintext fields from an older connection.
export function encryptedQboTokenUpdateFields({ accessToken, refreshToken }) {
  return {
    ...encryptedQboTokenFields({ accessToken, refreshToken }),
    accessToken: FieldValue.delete(),
    refreshToken: FieldValue.delete(),
  };
}

/**
 * Ensures we have a valid access token for QBO and returns it along with realmId
 */
export async function getValidQboToken() {
  const qboSettingDoc = adminDb.collection("settings").doc("quickbooks");
  const qboSnap = await qboSettingDoc.get();
  if (!qboSnap.exists) {
    throw new Error("QuickBooks is not connected.");
  }

  const qboData = qboSnap.data();
  let { accessToken, refreshToken } = readQboTokens(qboData);
  const realmId = qboData?.realmId;

  if (!accessToken || !realmId) {
    throw new Error(
      "QuickBooks settings are missing access token or Realm ID.",
    );
  }

  // Refresh token if expired or about to expire (within 60 seconds)
  if (
    qboData.accessTokenExpiresAt &&
    Date.now() >= qboData.accessTokenExpiresAt - 60_000
  ) {
    const { QBO_CLIENT_ID: clientId, QBO_CLIENT_SECRET: clientSecret } =
      process.env;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("QuickBooks authorization needs to be renewed.");
    }

    const refreshResponse = await fetch(
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }).toString(),
      },
    );

    if (!refreshResponse.ok) {
      throw new Error(
        "QuickBooks token refresh failed: " + (await refreshResponse.text()),
      );
    }

    const refreshData = await refreshResponse.json();
    accessToken = refreshData.access_token;
    await qboSettingDoc.update({
      ...encryptedQboTokenUpdateFields({
        accessToken: refreshData.access_token,
        refreshToken: refreshData.refresh_token,
      }),
      accessTokenExpiresAt: Date.now() + refreshData.expires_in * 1000,
      refreshTokenExpiresAt:
        Date.now() + refreshData.x_refresh_token_expires_in * 1000,
    });
  }

  return { accessToken, realmId };
}

/**
 * Resolves a QBO Vendor ID by email, or creates a new Vendor in QBO if not found
 */
export async function getOrCreateVendor(name, email) {
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);

  // 1. Query Vendor by DisplayName (PrimaryEmailAddr is not queryable in QBO)
  const escapedName = name.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `select * from Vendor where DisplayName = '${escapedName}'`,
  );
  const queryUrl = `${baseUrl}/query?query=${query}`;

  const searchRes = await fetch(queryUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });

  if (!searchRes.ok) {
    throw new Error(
      "Failed to search vendor in QBO: " + (await searchRes.text()),
    );
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
    PrimaryEmailAddr: { Address: email },
  };

  try {
    const createRes = await fetch(createUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(vendorPayload),
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
    if (code === "6240") {
      // Duplicate Name Error: retry with " (Contractor)" suffix
      const fallbackPayload = {
        DisplayName: `${name} (Contractor)`,
        PrimaryEmailAddr: { Address: email },
      };

      const retryRes = await fetch(createUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(fallbackPayload),
      });

      if (!retryRes.ok) {
        throw new Error(
          "Failed to create vendor in QBO after duplicate retry: " +
            (await retryRes.text()),
        );
      }

      const retryData = await retryRes.json();
      return retryData.Vendor.Id;
    }

    throw new Error("Failed to create vendor in QBO: " + errorText);
  } catch (err) {
    throw err;
  }
}

export async function getOrCreateCustomer(customer) {
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);
  const displayName = String(customer.name || "TechSavvy Customer").trim();
  const escapedName = displayName.replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `select * from Customer where DisplayName = '${escapedName}'`,
  );
  const searchRes = await fetch(`${baseUrl}/query?query=${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!searchRes.ok)
    throw new Error(
      "QuickBooks customer lookup failed: " + (await searchRes.text()),
    );
  const existing = (await searchRes.json()).QueryResponse?.Customer?.[0];
  if (existing) return existing;

  const payload = { DisplayName: displayName };
  if (customer.email) payload.PrimaryEmailAddr = { Address: customer.email };
  if (customer.phone) payload.PrimaryPhone = { FreeFormNumber: customer.phone };
  if (customer.address) payload.BillAddr = { Line1: customer.address };
  const createRes = await fetch(`${baseUrl}/customer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!createRes.ok)
    throw new Error(
      "QuickBooks customer creation failed: " + (await createRes.text()),
    );
  return (await createRes.json()).Customer;
}

export async function getDefaultSalesItem() {
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);
  if (process.env.QBO_DEFAULT_ITEM_ID)
    return {
      Id: process.env.QBO_DEFAULT_ITEM_ID,
      Name: "Configured service item",
    };
  const query = encodeURIComponent(
    "select * from Item where Active = true maxresults 100",
  );
  const response = await fetch(`${baseUrl}/query?query=${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  });
  if (!response.ok)
    throw new Error(
      "QuickBooks product/service lookup failed: " + (await response.text()),
    );
  const items = (await response.json()).QueryResponse?.Item || [];
  const item =
    items.find(
      (candidate) =>
        candidate.Type === "Service" && /service/i.test(candidate.Name),
    ) ||
    items.find((candidate) => candidate.Type === "Service") ||
    items[0];
  if (!item)
    throw new Error(
      "QuickBooks has no active Product/Service item. Create one or configure QBO_DEFAULT_ITEM_ID.",
    );
  return item;
}

export async function createQboCustomerInvoice(invoice, customer) {
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);
  const [qboCustomer, item] = await Promise.all([
    getOrCreateCustomer(customer),
    getDefaultSalesItem(),
  ]);
  const lines = (invoice.lineItems || []).map((line) => ({
    Amount: Number(line.quantity || 0) * Number(line.unitPrice || 0),
    Description: line.description,
    DetailType: "SalesItemLineDetail",
    SalesItemLineDetail: {
      ItemRef: { value: item.Id, name: item.Name },
      Qty: Number(line.quantity || 0),
      UnitPrice: Number(line.unitPrice || 0),
    },
  }));
  if (Number(invoice.discount || 0) > 0)
    lines.push({
      Amount: Number(invoice.discount),
      DetailType: "DiscountLineDetail",
      DiscountLineDetail: { PercentBased: false },
    });
  const payload = {
    CustomerRef: { value: qboCustomer.Id, name: qboCustomer.DisplayName },
    DocNumber: invoice.invoiceNumber,
    TxnDate: invoice.issueDate,
    DueDate: invoice.dueDate,
    PrivateNote: `TechSavvy CRM invoice ${invoice.id}`,
    CustomerMemo: {
      value:
        invoice.customerMessage ||
        `Thank you for choosing TechSavvy. Terms: ${invoice.paymentTerms || "Net 30"}.`,
    },
    Line: lines,
  };
  if (customer.email) {
    payload.BillEmail = { Address: customer.email };
    payload.AllowOnlinePayment = true;
    payload.AllowOnlineCreditCardPayment = true;
    payload.AllowOnlineACHPayment = true;
  }
  const response = await fetch(`${baseUrl}/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok)
    throw new Error(
      "QuickBooks invoice export failed: " + (await response.text()),
    );
  const createdInvoice = (await response.json()).Invoice;
  let linkedInvoice = createdInvoice;
  if (createdInvoice?.Id) {
    const linkedResponse = await fetch(
      `${baseUrl}/invoice/${createdInvoice.Id}?include=invoiceLink&minorversion=75`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      },
    );
    if (linkedResponse.ok) linkedInvoice = (await linkedResponse.json()).Invoice;
  }
  return {
    invoice: linkedInvoice,
    customer: qboCustomer,
    item,
  };
}

export async function getQboInvoicePaymentLink(invoiceId) {
  const { accessToken, realmId } = await getValidQboToken();
  const response = await fetch(
    `${qboCompanyBaseUrl(realmId)}/invoice/${invoiceId}?include=invoiceLink&minorversion=75`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok)
    throw new Error("QuickBooks invoice link lookup failed: " + (await response.text()));
  const invoice = (await response.json()).Invoice;
  return { invoice, invoiceLink: invoice?.InvoiceLink || null };
}

// Status is derived the same way for both a reconciled local invoice and a
// freshly-imported one, so an invoice that started life in QuickBooks (never
// created by this app) looks and sorts identically once it's mirrored here.
function qboInvoiceStatus(remote, balance, amountPaid, now) {
  const remoteStatus = String(remote.invoiceStatus || "").toUpperCase();
  if (remoteStatus.includes("VOID")) return "Void";
  if (balance === 0) return "Paid";
  if (amountPaid > 0) return "Partially Paid";
  if (remote.DueDate && new Date(`${remote.DueDate}T00:00:00`) < now) return "Overdue";
  return "Open";
}

export async function reconcileQboInvoices() {
  const localSnapshot = await adminDb.collection("invoices").get();
  const localInvoices = localSnapshot.docs
    .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
    .filter((invoice) => invoice.qboSync?.id);
  const localQboIds = new Set(localInvoices.map((invoice) => String(invoice.qboSync.id)));

  const { accessToken, realmId } = await getValidQboToken();
  const query = encodeURIComponent("select * from Invoice maxresults 1000");
  const response = await fetch(
    `${qboCompanyBaseUrl(realmId)}/query?query=${query}&include=invoiceLink&minorversion=75`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok)
    throw new Error("QuickBooks invoice reconciliation failed: " + (await response.text()));
  const qboInvoices = (await response.json()).QueryResponse?.Invoice || [];
  const byId = new Map(qboInvoices.map((invoice) => [String(invoice.Id), invoice]));
  const now = new Date();
  const changes = [];

  // So a newly-imported invoice can resolve customerId, not just a display
  // name -- requires syncQboCustomers() to have linked/created the customer
  // first (its qboCustomerId matches CustomerRef.value here).
  const customersSnapshot = await adminDb.collection("customers").get();
  const customerByQboId = new Map(
    customersSnapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((c) => c.qboCustomerId)
      .map((c) => [String(c.qboCustomerId), c.id]),
  );

  // Invoices created directly in QuickBooks (not through this app) have no
  // local record at all, so the loop below -- which only ever updates
  // existing local docs -- would never see them. Mirror a lightweight record
  // for each one so revenue billed outside the CRM still shows up here (e.g.
  // Job Profitability, the Invoices tab).
  //
  // IMPORTANT: this must never backfill QuickBooks' history into the CRM --
  // the CRM is explicitly a lower-security surface than QuickBooks, so only
  // invoices *created in QBO from this point forward* are mirrored here.
  // The cutoff is a persisted watermark rather than "today", so it survives
  // restarts and doesn't drift. The first run after this watermark is
  // introduced sets it to now and imports nothing that run (there's nothing
  // in QBO yet with a CreateTime after "now"); every run after that only
  // imports invoices created after the watermark.
  const qboSettingsRef = adminDb.collection("settings").doc("quickbooks");
  const qboSettingsSnap = await qboSettingsRef.get();
  let watermark = qboSettingsSnap.data()?.invoiceSyncWatermarkAt;
  if (!watermark) {
    watermark = now.toISOString();
    await qboSettingsRef.set({ invoiceSyncWatermarkAt: watermark }, { merge: true });
  }
  const watermarkMs = new Date(watermark).getTime();

  let imported = 0;
  for (const remote of qboInvoices) {
    const qboId = String(remote.Id);
    if (localQboIds.has(qboId)) continue;
    const createdAt = remote.MetaData?.CreateTime;
    if (!createdAt || new Date(createdAt).getTime() < watermarkMs) continue;
    const total = Number(remote.TotalAmt || 0);
    const balance = Math.max(0, Number(remote.Balance ?? total));
    const amountPaid = Math.max(0, total - balance);
    const status = qboInvoiceStatus(remote, balance, amountPaid, now);
    const importedAt = new Date().toISOString();
    const ref = adminDb.collection("invoices").doc();
    await ref.set({
      invoiceNumber: remote.DocNumber || `QBO-${qboId}`,
      jobId: null,
      customerId: customerByQboId.get(String(remote.CustomerRef?.value || "")) || null,
      workOrderNumber: "",
      customer: remote.CustomerRef?.name || "QuickBooks customer",
      site: "",
      status,
      issueDate: remote.TxnDate || importedAt.slice(0, 10),
      dueDate: remote.DueDate || "",
      lineItems: [{ description: "Imported from QuickBooks", quantity: 1, unitPrice: total, kind: "service" }],
      subtotal: total,
      discount: 0,
      taxRate: 0,
      tax: 0,
      total,
      amountPaid,
      balance,
      payments: [],
      paymentTerms: "",
      customerMessage: "",
      earlyBillingOverride: false,
      sourceTimeEntryIds: [],
      importedFromQbo: true,
      qboSync: {
        status: "synced",
        id: remote.Id,
        syncToken: remote.SyncToken || null,
        invoiceLink: remote.InvoiceLink || null,
        onlinePaymentEnabled: Boolean(remote.InvoiceLink),
        lastReconciledAt: importedAt,
        qboLastUpdatedAt: remote.MetaData?.LastUpdatedTime || null,
        reconciliationStatus: "current",
      },
      createdAt: importedAt,
      updatedAt: importedAt,
    });
    localQboIds.add(qboId);
    imported++;
  }

  if (!localInvoices.length && !imported) return { checked: 0, updated: 0, imported: 0, changes: [] };
  for (const local of localInvoices) {
    const remote = byId.get(String(local.qboSync.id));
    if (!remote) continue;
    const total = Number(remote.TotalAmt ?? local.total ?? 0);
    const balance = Math.max(0, Number(remote.Balance ?? local.balance ?? total));
    const amountPaid = Math.max(0, total - balance);
    const status = qboInvoiceStatus(remote, balance, amountPaid, now);
    const changed = Number(local.balance ?? local.total ?? 0) !== balance || Number(local.amountPaid || 0) !== amountPaid || local.status !== status;
    const reconciledAt = new Date().toISOString();
    await local.ref.update({
      total,
      balance,
      amountPaid,
      status,
      qboSync: {
        ...local.qboSync,
        syncToken: remote.SyncToken || local.qboSync.syncToken,
        invoiceLink: remote.InvoiceLink || local.qboSync.invoiceLink || null,
        onlinePaymentEnabled: Boolean(remote.InvoiceLink || local.qboSync.invoiceLink),
        lastReconciledAt: reconciledAt,
        qboLastUpdatedAt: remote.MetaData?.LastUpdatedTime || null,
        reconciliationStatus: "current",
      },
      updatedAt: reconciledAt,
    });
    if (changed) changes.push({ id: local.id, invoiceNumber: local.invoiceNumber || local.id, previousBalance: Number(local.balance ?? local.total ?? 0), balance, amountPaid, status });
  }
  return { checked: localInvoices.length, updated: changes.length, imported, changes };
}

// Pulls QuickBooks' customer list into the CRM's own `customers` collection,
// so future invoice imports (see the loop above) can resolve `customerId`
// via the stable `qboCustomerId` link instead of a fragile name match, and
// so new jobs/quotes/invoices created in the CRM can be billed against the
// same customer identity QuickBooks already has. Never overwrites an
// existing CRM customer's other fields -- an already-matched name only gets
// the qboCustomerId link backfilled onto it. A name matching more than one
// local customer is left unresolved (reported, not guessed) rather than
// risking a wrong link.
export async function syncQboCustomers() {
  const { accessToken, realmId } = await getValidQboToken();
  const query = encodeURIComponent("select * from Customer maxresults 1000");
  const response = await fetch(
    `${qboCompanyBaseUrl(realmId)}/query?query=${query}&minorversion=75`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } },
  );
  if (!response.ok)
    throw new Error("QuickBooks customer sync failed: " + (await response.text()));
  const qboCustomers = ((await response.json()).QueryResponse?.Customer || [])
    .filter((customer) => customer.Active !== false && customer.Job !== true);

  const localSnapshot = await adminDb.collection("customers").get();
  const localCustomers = localSnapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
  const localByQboId = new Map(localCustomers.filter((c) => c.qboCustomerId).map((c) => [String(c.qboCustomerId), c]));
  const localByName = new Map();
  for (const local of localCustomers) {
    const key = String(local.name || "").trim().toLowerCase();
    if (!key) continue;
    if (!localByName.has(key)) localByName.set(key, []);
    localByName.get(key).push(local);
  }

  const now = new Date().toISOString();
  const linked = [];
  const created = [];
  const ambiguous = [];
  let alreadyLinked = 0;

  for (const remote of qboCustomers) {
    const qboId = String(remote.Id);
    if (localByQboId.has(qboId)) {
      alreadyLinked++;
      continue;
    }
    const name = String(remote.DisplayName || remote.CompanyName || "").trim();
    if (!name) continue;
    const nameMatches = localByName.get(name.toLowerCase()) || [];
    if (nameMatches.length > 1) {
      ambiguous.push({ qboId, name, localMatches: nameMatches.map((c) => c.id) });
      continue;
    }
    if (nameMatches.length === 1) {
      await nameMatches[0].ref.update({ qboCustomerId: qboId, updatedAt: now });
      linked.push({ qboId, name, customerId: nameMatches[0].id });
      continue;
    }
    const ref = adminDb.collection("customers").doc();
    await ref.set({
      name,
      contact: "",
      email: remote.PrimaryEmailAddr?.Address || "",
      phone: remote.PrimaryPhone?.FreeFormNumber || "",
      sites: remote.BillAddr?.Line1 ? [remote.BillAddr.Line1] : [],
      assets: 0,
      lifetimeValue: 0,
      qboCustomerId: qboId,
      importedFromQbo: true,
      personnel: [],
      billingRecipientEmails: [],
      approvedDomains: [],
      referencePrefixes: [],
      defaultContactPolicy: "techsavvy_only",
      createdAt: now,
      updatedAt: now,
    });
    created.push({ qboId, name, customerId: ref.id });
  }

  return { totalQboCustomers: qboCustomers.length, alreadyLinked, linked, created, ambiguous };
}

/**
 * Creates a Vendor Bill in QBO for an Approved Timecard
 */
export async function createQBOBillForTimecard(timecard, payoutDueDate) {
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);

  // Resolve QBO Vendor ID
  const vendorId = await getOrCreateVendor(
    timecard.technicianName,
    timecard.technicianEmail,
  );

  const promises = [];
  let laborPromiseIdx = -1;
  let expensePromiseIdx = -1;

  // 1. Labor -> TimeActivity
  const decimalHours = Number(timecard.totalHours || 0);
  const laborRate = Number(timecard.rate || 75);
  if (timecard.laborStatus === "approved" && decimalHours > 0) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    const timeActivityPayload = {
      NameOf: "Vendor",
      VendorRef: { value: vendorId },
      TxnDate: timecard.date,
      Hours: hours,
      Minutes: minutes,
      HourlyRate: laborRate,
      Description: `Labor: ${timecard.totalHours} hrs @ $${laborRate}/hr (${timecard.jobSite})`,
    };

    const timeActivityUrl = `${baseUrl}/timeactivity`;
    const timePromise = fetch(timeActivityUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(timeActivityPayload),
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error(
          "Failed to create TimeActivity in QBO: " + (await res.text()),
        );
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
  if (timecard.suppliesStatus === "approved" && supplies > 0) {
    expenseLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: supplies,
      Description: `Supplies Reimbursement (${timecard.jobSite})`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: process.env.QBO_EXPENSE_ACCOUNT_SUPPLIES || "81" },
      },
    });
  }

  if (timecard.travelStatus === "approved" && travel > 0) {
    expenseLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: travel,
      Description: `Travel Expense (${timecard.jobSite})`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: process.env.QBO_EXPENSE_ACCOUNT_TRAVEL || "82" },
      },
    });
  }

  const bonus = Number(timecard.bonusCost || 0);
  if (timecard.bonusStatus === "approved" && bonus > 0) {
    expenseLines.push({
      DetailType: "AccountBasedExpenseLineDetail",
      Amount: bonus,
      Description: `Bonus / Misc Payroll Adjustment (${timecard.jobSite})`,
      AccountBasedExpenseLineDetail: {
        AccountRef: { value: process.env.QBO_EXPENSE_ACCOUNT_BONUS || "83" },
      },
    });
  }

  if (expenseLines.length > 0) {
    const billPayload = {
      VendorRef: { value: vendorId },
      TxnDate: timecard.date,
      DueDate: payoutDueDate.toISOString().split("T")[0],
      PrivateNote: `TechSavvyTechs Approval ID: ${timecard.id}`,
      Line: expenseLines,
    };

    const billUrl = `${baseUrl}/bill`;
    const billPromise = fetch(billUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(billPayload),
    }).then(async (res) => {
      if (!res.ok) {
        throw new Error("Failed to create Bill in QBO: " + (await res.text()));
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

async function deleteQboEntity(entityName, id) {
  if (!id) return { skipped: true };
  const { accessToken, realmId } = await getValidQboToken();
  const baseUrl = qboCompanyBaseUrl(realmId);
  const entityPath = entityName.toLowerCase();
  const readResponse = await fetch(`${baseUrl}/${entityPath}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!readResponse.ok) {
    const errorText = await readResponse.text();
    let errorCode = '';
    try {
      const parsed = JSON.parse(errorText);
      errorCode = String(parsed?.Fault?.Error?.[0]?.code || parsed?.fault?.error?.[0]?.code || '');
    } catch (_) {}
    if (readResponse.status === 404 || (readResponse.status === 400 && errorCode === '610')) return { id, alreadyDeleted: true };
    throw new Error(`QuickBooks could not load ${entityName} ${id}: ${errorText}`);
  }
  const current = (await readResponse.json())[entityName];
  if (!current?.Id || current.SyncToken === undefined) throw new Error(`QuickBooks returned an incomplete ${entityName} record.`);
  const deleteResponse = await fetch(`${baseUrl}/${entityPath}?operation=delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ Id: current.Id, SyncToken: current.SyncToken }),
  });
  if (!deleteResponse.ok) throw new Error(`QuickBooks could not delete ${entityName} ${id}: ${await deleteResponse.text()}`);
  return { id: current.Id, deleted: true };
}

/** Removes only the QuickBooks records created for one portal timecard. */
export async function reverseQBOTimecard(timecard) {
  const results = {};
  if (timecard.qboTimeActivityId) results.timeActivity = await deleteQboEntity('TimeActivity', timecard.qboTimeActivityId);
  if (timecard.qboBillId) results.bill = await deleteQboEntity('Bill', timecard.qboBillId);
  if (!timecard.qboTimeActivityId && !timecard.qboBillId) throw new Error('This synced entry has no stored QuickBooks transaction ID. Correct it in QuickBooks before closing the portal record.');
  return results;
}
