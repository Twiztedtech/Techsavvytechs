// What a signed-in client may see about their company's requests and invoices. Pure functions (no
// database, no network) so the role rules and the client-safe shapes can be tested directly.

const text = (value, max = 300) => String(value ?? '').trim().slice(0, max);
const number = (value) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const has = (profile, ...roles) => Array.isArray(profile?.roles) && roles.some((role) => profile.roles.includes(role));

export const REQUEST_LABELS = {
  requested: 'Received',
  reviewing: 'Being reviewed',
  clarification_needed: 'We need more information',
  approved: 'Approved, scheduling',
  converted: 'Approved and scheduled',
  declined: 'Declined',
};

/** Company administrators see every company request; everyone else only the ones they submitted. */
export function canSeeRequest(profile, request) {
  if (!profile?.customerId || request?.customerId !== profile.customerId) return false;
  return has(profile, 'company_admin') || (Boolean(profile.id) && request.createdByClientUid === profile.id);
}

/** Invoices are billing information: billing and company-admin roles only. */
export function canSeeInvoices(profile) {
  return has(profile, 'billing', 'company_admin');
}

/** Only fields written for the customer. Internal notes, token hashes and reviewer ids never appear. */
export function requestView(id, request) {
  const status = REQUEST_LABELS[request.status] ? request.status : 'requested';
  const window = Array.isArray(request.requestedWindows) ? request.requestedWindows[0] : null;
  const showNote = status === 'clarification_needed' || status === 'declined';
  return {
    id,
    requestNumber: text(request.requestNumber, 40),
    siteName: text(request.siteName, 160),
    address: text(request.address, 240),
    requestedDate: text(window?.date, 10),
    requestedStart: text(window?.start, 5),
    requestedEnd: text(window?.end, 5),
    status,
    statusLabel: REQUEST_LABELS[status],
    note: showNote ? text(request.reviewNote, 2000) : '',
    convertedJobId: text(request.convertedJobId, 120),
    createdAt: text(request.createdAt, 40),
  };
}

/** `docs` are { id, data } pairs. */
export function visibleRequests(profile, docs) {
  return docs
    .filter((doc) => canSeeRequest(profile, doc.data))
    .map((doc) => requestView(doc.id, doc.data))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const HIDDEN = new Set(['voided', 'void', 'draft', 'cancelled', 'canceled']);

/** True when an invoice should never reach the customer. */
export function invoiceHidden(invoice) {
  return HIDDEN.has(String(invoice?.status || '').toLowerCase());
}

export function invoiceView(id, invoice, today, jobNumbers = {}) {
  const total = number(invoice.total);
  const balance = Math.max(0, number(invoice.balance ?? invoice.total));
  const dueDate = text(invoice.dueDate, 10);
  const link = text(invoice.qboSync?.invoiceLink, 600);
  return {
    id,
    number: text(invoice.invoiceNumber || id, 60),
    status: balance <= 0 ? 'Paid' : dueDate && dueDate < today ? 'Overdue' : 'Open',
    issueDate: text(invoice.issueDate, 10),
    dueDate,
    total,
    balance,
    overdue: balance > 0 && Boolean(dueDate) && dueDate < today,
    jobNumber: text(jobNumbers[invoice.jobId] || '', 60),
    paymentLink: /^https:\/\//i.test(link) ? link : '',
  };
}

/** `docs` are { id, data } pairs. Returns null when the viewer is not allowed to see billing. */
export function accountInvoices(profile, docs, today, jobNumbers = {}) {
  if (!canSeeInvoices(profile)) return null;
  const invoices = docs
    .filter((doc) => !invoiceHidden(doc.data))
    .map((doc) => invoiceView(doc.id, doc.data, today, jobNumbers))
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  return {
    invoices,
    outstandingTotal: Math.round(invoices.reduce((sum, i) => sum + i.balance, 0) * 100) / 100,
    overdueCount: invoices.filter((i) => i.overdue).length,
  };
}
