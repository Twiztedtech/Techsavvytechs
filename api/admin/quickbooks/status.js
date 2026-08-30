import { adminDb, requireAdmin } from '../../_lib/firebase-admin.js';
import { qboEnvironment } from '../../_lib/quickbooks-config.js';
import { createQboCustomerInvoice, getQboInvoicePaymentLink } from '../../_lib/qbo-helper.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await requireAdmin(req);
    if (req.method === 'POST' && req.query?.operation === 'sync-invoice') {
      const invoiceId = String(req.body?.invoiceId || '').trim();
      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required.' });
      const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
      const invoiceSnapshot = await invoiceRef.get();
      if (!invoiceSnapshot.exists) return res.status(404).json({ error: 'Invoice not found.' });
      const invoice = { id: invoiceSnapshot.id, ...invoiceSnapshot.data() };
      if (invoice.qboSync?.id) {
        const linked = await getQboInvoicePaymentLink(invoice.qboSync.id);
        const qboSync = { ...invoice.qboSync, syncToken: linked.invoice?.SyncToken || invoice.qboSync.syncToken, invoiceLink: linked.invoiceLink, onlinePaymentEnabled: Boolean(linked.invoiceLink), lastSyncedAt: new Date().toISOString() };
        await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
        return res.status(200).json({ synced: true, duplicatePrevented: true, qboSync });
      }
      const customerSnapshot = await adminDb.collection('customers').where('name', '==', invoice.customer).limit(1).get();
      const customerData = customerSnapshot.empty ? { name: invoice.customer, address: invoice.site } : { name: invoice.customer, ...customerSnapshot.docs[0].data(), address: invoice.site };
      await invoiceRef.update({ qboSync: { status: 'syncing', lastAttemptAt: new Date().toISOString(), error: null }, updatedAt: new Date().toISOString() });
      try {
        const result = await createQboCustomerInvoice(invoice, customerData);
        const qboSync = { status: 'synced', id: result.invoice.Id, syncToken: result.invoice.SyncToken, customerId: result.customer.Id, itemId: result.item.Id, invoiceLink: result.invoice.InvoiceLink || null, onlinePaymentEnabled: Boolean(result.invoice.InvoiceLink), lastSyncedAt: new Date().toISOString(), error: null, syncedByUid: user.uid };
        await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
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
