// Small, dependency-free pieces of the QuickBooks invoice reconcile, kept
// apart from qbo-helper.js so they can be unit tested without Firebase.

/** Audit-log wording for one reconcile change. */
export function reconcileChangeSummary(change) {
  if (change.deletedInQbo && change.needsReview) return `${change.invoiceNumber} was deleted in QuickBooks but has payments recorded in the CRM; review it`;
  if (change.deletedInQbo) return `${change.invoiceNumber} was deleted in QuickBooks, so it was voided in the CRM`;
  return `QuickBooks updated ${change.invoiceNumber}: balance ${change.previousBalance} → ${change.balance}`;
}

// QuickBooks answers a lookup of a deleted invoice with fault code 610,
// "Object Not Found".
export function qboObjectNotFound(responseText) {
  const text = String(responseText || "");
  return /"code"\s*:\s*"610"/.test(text) || /Object Not Found/i.test(text);
}
