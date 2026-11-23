import { adminDb } from './firebase-admin.js';
import { createQboCustomerInvoice, getQboInvoicePaymentLink } from './qbo-helper.js';
import { writeAudit } from './audit.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

// Creates the invoice in QuickBooks (or refreshes the pay link when it is
// already there) and stores the result on the CRM invoice. Used by the
// "Sync to QuickBooks" button and before any invoice is emailed, so the
// customer's link always has a working online payment option.
export async function syncInvoiceToQbo(invoiceId, user) {
  const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
  // A transaction closes the check-then-act window between reading
  // qboSync and marking the invoice 'syncing', so two concurrent sync
  // requests can't both proceed to create a QuickBooks invoice.
  let invoice;
  try {
    invoice = await adminDb.runTransaction(async (tx) => {
      const snapshot = await tx.get(invoiceRef);
      if (!snapshot.exists) throw httpError(404, 'Invoice not found.');
      const data = snapshot.data();
      if (data.qboSync?.status === 'syncing') throw httpError(409, 'A QuickBooks sync is already in progress for this invoice.');
      if (!data.qboSync?.id) {
        tx.update(invoiceRef, { qboSync: { status: 'syncing', lastAttemptAt: new Date().toISOString(), error: null }, updatedAt: new Date().toISOString() });
      }
      return { id: snapshot.id, ...data };
    });
  } catch (error) {
    if (error.status) throw error;
    throw httpError(500, 'Could not start the QuickBooks sync.');
  }

  if (invoice.qboSync?.id) {
    const linked = await getQboInvoicePaymentLink(invoice.qboSync.id);
    const qboSync = { ...invoice.qboSync, syncToken: linked.invoice?.SyncToken || invoice.qboSync.syncToken, invoiceLink: linked.invoiceLink, onlinePaymentEnabled: Boolean(linked.invoiceLink), lastSyncedAt: new Date().toISOString() };
    await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
    await writeAudit({ actor: user, action: 'refreshed-payment-link', entityType: 'invoice', entityId: invoiceId, summary: `Refreshed QuickBooks payment link for ${invoice.invoiceNumber || invoiceId}`, details: { qboInvoiceId: invoice.qboSync.id }, source: 'api' });
    return { qboSync, duplicatePrevented: true };
  }

  const customerSnapshot = await adminDb.collection('customers').where('name', '==', invoice.customer).limit(1).get();
  const customerData = customerSnapshot.empty ? { name: invoice.customer, address: invoice.site } : { name: invoice.customer, ...customerSnapshot.docs[0].data(), address: invoice.site };
  try {
    const result = await createQboCustomerInvoice(invoice, customerData);
    const qboSync = { status: 'synced', id: result.invoice.Id, syncToken: result.invoice.SyncToken, customerId: result.customer.Id, itemId: result.item.Id, invoiceLink: result.invoice.InvoiceLink || null, onlinePaymentEnabled: Boolean(result.invoice.InvoiceLink), lastSyncedAt: new Date().toISOString(), error: null, syncedByUid: user?.uid || null };
    await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
    await writeAudit({ actor: user, action: 'synced', entityType: 'invoice', entityId: invoiceId, summary: `Synced ${invoice.invoiceNumber || invoiceId} to QuickBooks`, details: { qboInvoiceId: result.invoice.Id }, source: 'api' });
    return { qboSync, duplicatePrevented: false };
  } catch (error) {
    await invoiceRef.update({ qboSync: { status: 'error', lastAttemptAt: new Date().toISOString(), error: error.message }, updatedAt: new Date().toISOString() });
    throw error;
  }
}
