import { adminDb, requireAdmin } from "../../_lib/firebase-admin.js";
import { createQboCustomerInvoice } from "../../_lib/qbo-helper.js";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await requireAdmin(req);
    const invoiceId = String(req.body?.invoiceId || "").trim();
    if (!invoiceId)
      return res.status(400).json({ error: "Invoice ID is required." });
    const invoiceRef = adminDb.collection("invoices").doc(invoiceId);
    const invoiceSnapshot = await invoiceRef.get();
    if (!invoiceSnapshot.exists)
      return res.status(404).json({ error: "Invoice not found." });
    const invoice = { id: invoiceSnapshot.id, ...invoiceSnapshot.data() };
    if (invoice.qboSync?.id)
      return res
        .status(200)
        .json({
          synced: true,
          duplicatePrevented: true,
          qboSync: invoice.qboSync,
        });
    const customerSnapshot = await adminDb
      .collection("customers")
      .where("name", "==", invoice.customer)
      .limit(1)
      .get();
    const customerData = customerSnapshot.empty
      ? { name: invoice.customer, address: invoice.site }
      : {
          name: invoice.customer,
          ...customerSnapshot.docs[0].data(),
          address: invoice.site,
        };
    await invoiceRef.update({
      qboSync: {
        status: "syncing",
        lastAttemptAt: new Date().toISOString(),
        error: null,
      },
      updatedAt: new Date().toISOString(),
    });
    try {
      const result = await createQboCustomerInvoice(invoice, customerData);
      const qboSync = {
        status: "synced",
        id: result.invoice.Id,
        syncToken: result.invoice.SyncToken,
        customerId: result.customer.Id,
        itemId: result.item.Id,
        lastSyncedAt: new Date().toISOString(),
        error: null,
        syncedByUid: user.uid,
      };
      await invoiceRef.update({ qboSync, updatedAt: new Date().toISOString() });
      return res.status(200).json({ synced: true, qboSync });
    } catch (error) {
      await invoiceRef.update({
        qboSync: {
          status: "error",
          lastAttemptAt: new Date().toISOString(),
          error: error.message,
        },
        updatedAt: new Date().toISOString(),
      });
      throw error;
    }
  } catch (error) {
    if (
      error.message === "Authentication required." ||
      error.message === "Administrator access required."
    )
      return res.status(403).json({ error: error.message });
    console.error("QuickBooks invoice sync failed:", error);
    return res
      .status(500)
      .json({ error: error.message || "QuickBooks invoice sync failed." });
  }
}
