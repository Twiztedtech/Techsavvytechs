import { adminDb, requireAdmin } from '../../_lib/firebase-admin.js';
import { qboEnvironment } from '../../_lib/quickbooks-config.js';
import { createQboCustomerInvoice, getQboInvoicePaymentLink, reconcileQboInvoices } from '../../_lib/qbo-helper.js';
import { writeAudit } from '../../_lib/audit.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireAdmin(req);
    if (req.method === 'POST' && req.query?.operation === 'disconnect') {
      await adminDb.collection('settings').doc('quickbooks').delete();
      await writeAudit({ actor: user, action: 'disconnected', entityType: 'quickbooks', entityId: 'connection', summary: 'Disconnected QuickBooks Online', source: 'api' });
      return res.status(200).json({ success: true });
    }
    if (req.method === 'POST' && req.query?.operation === 'reconcile-invoices') {
      const result = await reconcileQboInvoices();
      for (const change of result.changes) await writeAudit({ actor: user, action: 'payment-reconciled', entityType: 'invoice', entityId: change.id, summary: `QuickBooks updated ${change.invoiceNumber}: balance ${change.previousBalance} → ${change.balance}`, details: change, source: 'api' });
      await writeAudit({ actor: user, action: 'reconciled', entityType: 'quickbooks', entityId: 'invoices', summary: `Reconciled ${result.checked} QuickBooks invoice${result.checked === 1 ? '' : 's'}; ${result.updated} balance${result.updated === 1 ? '' : 's'} changed; ${result.imported || 0} new invoice${result.imported === 1 ? '' : 's'} imported from QuickBooks`, details: { checked: result.checked, updated: result.updated, imported: result.imported || 0 }, source: 'api' });
      return res.status(200).json({ success: true, ...result });
    }
    if (req.method === 'POST' && req.query?.operation === 'sync-invoice') {
      const invoiceId = String(req.body?.invoiceId || '').trim();
      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required.' });
      const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
      // A transaction closes the check-then-act window between reading
      // qboSync and marking the invoice 'syncing', so two concurrent sync
      // requests can't both proceed to create a QuickBooks invoice.
      let invoice;
      try {
        invoice = await adminDb.runTransaction(async (tx) => {
          const snapshot = await tx.get(invoiceRef);
          if (!snapshot.exists) throw Object.assign(new Error('Invoice not found.'), { status: 404 });
          const data = snapshot.data();
          if (data.qboSync?.status === 'syncing') {
            throw Object.assign(new Error('A QuickBooks sync is already in progress for this invoice.'), { status: 409 });
          }
          if (!data.qboSync?.id) {
            tx.update(invoiceRef, { qboSync: { status: 'syncing', lastAttemptAt: new Date().toISOString(), error: null }, updatedAt: new Date().toISOString() });
          }
          return { id: snapshot.id, ...data };
        });
      } catch (error) {
        return res.status(error.status || 500).json({ error: error.status ? error.message : 'Could not start the QuickBooks sync.' });
      }
      if (invoice.qboSync?.id) {
        const linked = await getQboInvoicePaymentLink(invoice.qboSync.id);
        const qboSync = { ...invoice.qboSync, syncToken: linked.invoice?.SyncToken || invoice.qboSync.syncToken, invoiceLink: linked.invoiceLink, onlinePaymentEnabled: Boolean(linked.invoiceLink), lastSyncedAt: new Date().toISOString() };
        await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
        await writeAudit({ actor: user, action: 'refreshed-payment-link', entityType: 'invoice', entityId: invoiceId, summary: `Refreshed QuickBooks payment link for ${invoice.invoiceNumber || invoiceId}`, details: { qboInvoiceId: invoice.qboSync.id }, source: 'api' });
        return res.status(200).json({ synced: true, duplicatePrevented: true, qboSync });
      }
      const customerSnapshot = await adminDb.collection('customers').where('name', '==', invoice.customer).limit(1).get();
      const customerData = customerSnapshot.empty ? { name: invoice.customer, address: invoice.site } : { name: invoice.customer, ...customerSnapshot.docs[0].data(), address: invoice.site };
      try {
        const result = await createQboCustomerInvoice(invoice, customerData);
        const qboSync = { status: 'synced', id: result.invoice.Id, syncToken: result.invoice.SyncToken, customerId: result.customer.Id, itemId: result.item.Id, invoiceLink: result.invoice.InvoiceLink || null, onlinePaymentEnabled: Boolean(result.invoice.InvoiceLink), lastSyncedAt: new Date().toISOString(), error: null, syncedByUid: user.uid };
        await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
        await writeAudit({ actor: user, action: 'synced', entityType: 'invoice', entityId: invoiceId, summary: `Synced ${invoice.invoiceNumber || invoiceId} to QuickBooks`, details: { qboInvoiceId: result.invoice.Id }, source: 'api' });
        return res.status(200).json({ synced: true, qboSync });
      } catch (error) {
        await invoiceRef.update({ qboSync: { status: 'error', lastAttemptAt: new Date().toISOString(), error: error.message }, updatedAt: new Date().toISOString() });
        throw error;
      }
    }
    const snapshot = await adminDb.collection('settings').doc('quickbooks').get();
    const data = snapshot.data();
    return res.status(200).json({
      connected: data?.status === 'connected',
      realmId: data?.realmId || null,
      environment: data?.environment || null,
      configuredEnvironment: qboEnvironment,
    });
  } catch (error) {
    if (error.message === 'Authentication required.' || error.message === 'Administrator access required.') {
      return res.status(403).json({ error: error.message });
    }
    console.error('QuickBooks administration request failed:', error);
    return res.status(500).json({ error: error.message || 'QuickBooks request failed.' });
  }
}
