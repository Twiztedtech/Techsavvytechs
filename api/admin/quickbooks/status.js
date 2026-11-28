import { adminDb, requireAdmin } from '../../_lib/firebase-admin.js';
import { handleAppCors } from '../../_lib/cors.js';
import { qboEnvironment } from '../../_lib/quickbooks-config.js';
import { FieldValue } from 'firebase-admin/firestore';
import { deleteQboInvoice, reconcileChangeSummary, reconcileQboInvoices, syncQboCustomers, voidQboInvoice } from '../../_lib/qbo-helper.js';
import { writeAudit } from '../../_lib/audit.js';
import { syncInvoiceToQbo } from '../../_lib/qbo-invoice-sync.js';

export default async function handler(req, res) {
  if (handleAppCors(req, res)) return;
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
      for (const change of result.changes) await writeAudit({ actor: user, action: 'payment-reconciled', entityType: 'invoice', entityId: change.id, summary: reconcileChangeSummary(change), details: change, source: 'api' });
      await writeAudit({ actor: user, action: 'reconciled', entityType: 'quickbooks', entityId: 'invoices', summary: `Reconciled ${result.checked} QuickBooks invoice${result.checked === 1 ? '' : 's'}; ${result.updated} balance${result.updated === 1 ? '' : 's'} changed; ${result.imported || 0} new invoice${result.imported === 1 ? '' : 's'} imported from QuickBooks`, details: { checked: result.checked, updated: result.updated, imported: result.imported || 0 }, source: 'api' });
      return res.status(200).json({ success: true, ...result });
    }
    if (req.method === 'POST' && req.query?.operation === 'void-invoice') {
      const invoiceId = String(req.body?.invoiceId || '').trim();
      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required.' });
      const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
      const snapshot = await invoiceRef.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Invoice not found.' });
      const invoice = snapshot.data();
      if (Number(invoice.amountPaid || 0) > 0) return res.status(409).json({ error: 'This invoice has payments recorded. Reverse them before voiding.' });
      const qboId = invoice.qboSync?.id;
      if (qboId) await voidQboInvoice(qboId);
      const now = new Date().toISOString();
      await invoiceRef.update({ status: 'voided', balance: 0, voidedAt: now, voidedBy: user.email || user.uid || '', updatedAt: now });
      await writeAudit({ actor: user, action: 'voided', entityType: 'invoice', entityId: invoiceId, summary: `Voided invoice ${invoice.invoiceNumber || invoiceId}${qboId ? ' in QuickBooks and the CRM' : ' in the CRM'}`, details: { qboId: qboId || null, total: invoice.total }, source: 'api' });
      return res.status(200).json({ success: true, quickbooksVoided: Boolean(qboId) });
    }
    // Unlock a synced, unpaid invoice for editing: remove its QuickBooks copy
    // (a delete, so the invoice number is free to sync again) and clear the link.
    if (req.method === 'POST' && req.query?.operation === 'unlock-invoice') {
      const invoiceId = String(req.body?.invoiceId || '').trim();
      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required.' });
      const invoiceRef = adminDb.collection('invoices').doc(invoiceId);
      const snapshot = await invoiceRef.get();
      if (!snapshot.exists) return res.status(404).json({ error: 'Invoice not found.' });
      const invoice = snapshot.data();
      if (Number(invoice.amountPaid || 0) > 0) return res.status(409).json({ error: 'This invoice has payments recorded and cannot be unlocked.' });
      // Only QuickBooks invoices this CRM invoice is, or was, linked to.
      const known = [invoice.qboSync?.id, ...(invoice.previousQboInvoiceIds || [])].filter(Boolean).map(String);
      const qboId = String(req.body?.qboInvoiceId || invoice.qboSync?.id || '').trim();
      if (!qboId || !known.includes(qboId)) return res.status(409).json({ error: 'This invoice is not linked to that QuickBooks invoice.' });
      const removed = await deleteQboInvoice(qboId);
      if (removed.docNumber && invoice.invoiceNumber && removed.docNumber !== invoice.invoiceNumber) console.warn('Unlocked invoice number mismatch', { invoiceId, qboId });
      const now = new Date().toISOString();
      const update = { previousQboInvoiceIds: known.filter((id) => id !== qboId), updatedAt: now };
      if (String(invoice.qboSync?.id || '') === qboId) Object.assign(update, { qboSync: FieldValue.delete() });
      await invoiceRef.update(update);
      await writeAudit({ actor: user, action: 'unlocked', entityType: 'invoice', entityId: invoiceId, summary: `Removed QuickBooks invoice ${qboId} so ${invoice.invoiceNumber || invoiceId} can be edited and synced again`, details: { qboId, total: invoice.total }, source: 'api' });
      return res.status(200).json({ success: true, quickbooksDeleted: qboId });
    }
    if (req.method === 'POST' && req.query?.operation === 'sync-customers') {
      const result = await syncQboCustomers();
      await writeAudit({
        actor: user,
        action: 'customers-synced',
        entityType: 'quickbooks',
        entityId: 'customers',
        summary: `Synced QuickBooks customers: ${result.linked.length} linked to existing CRM customers, ${result.created.length} new customers created, ${result.ambiguous.length} left unresolved (name matched more than one CRM customer)`,
        details: result,
        source: 'api',
      });
      return res.status(200).json({ success: true, ...result });
    }
    if (req.method === 'POST' && req.query?.operation === 'sync-invoice') {
      const invoiceId = String(req.body?.invoiceId || '').trim();
      if (!invoiceId) return res.status(400).json({ error: 'Invoice ID is required.' });
      try {
        const result = await syncInvoiceToQbo(invoiceId, user);
        return res.status(200).json({ synced: true, ...result });
      } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
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
