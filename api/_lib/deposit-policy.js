// Pure rules for the first-job deposit. Dependency-free (no Firebase) so the
// same file is used by the time-clock gate on the server and the CRM UI, and
// can be unit tested directly (same approach as notification-eligibility.js).

export const DEFAULT_DEPOSIT_HOURS = 2;

const positive = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};
const cents = (value) => Math.round(value * 100) / 100;

// First N hours: customer override, else the signed agreement's minimum, else 2.
export function depositHoursFor(customer) {
  return positive(customer?.depositHours) || positive(customer?.rateAgreement?.minimumHours) || DEFAULT_DEPOSIT_HOURS;
}

// Customer rate: the job's own bill rate, else the agreement's standard rate.
// 0 means "unknown" -- the caller must not send a $0 deposit invoice.
export function depositRateFor(job, customer) {
  return positive(job?.customerBillRate) || positive(customer?.rateAgreement?.standardRate);
}

export function depositAmount(job, customer) {
  const hours = depositHoursFor(customer);
  const rate = depositRateFor(job, customer);
  return { hours, rate, amount: cents(hours * rate) };
}

export function isDepositInvoice(invoice) {
  return invoice?.type === 'deposit' && !['void', 'voided'].includes(String(invoice?.status || '').toLowerCase());
}

export function isDepositPaid(invoice) {
  return isDepositInvoice(invoice) && Number(invoice.total) > 0 && Number(invoice.balance ?? invoice.total) <= 0;
}

// Returns { blocked, reason, establish }. `establish` tells the server it saw a
// paid deposit and should stamp the customer so later jobs are never blocked.
export function depositBlocksClockIn({ customer, job, depositInvoices = [] }) {
  if (!customer || customer.depositPolicy !== 'required') return { blocked: false, reason: 'not_required', establish: false };
  if (customer.depositEstablishedAt) return { blocked: false, reason: 'established', establish: false };
  if (job?.depositWaived === true) return { blocked: false, reason: 'job_waived', establish: false };
  if (depositInvoices.some(isDepositPaid)) return { blocked: false, reason: 'paid', establish: true };
  return { blocked: true, reason: 'deposit_due', establish: false };
}

// How much held credit to apply to an invoice: never more than the invoice
// subtotal, and never negative. Any remainder stays on the customer.
export function creditToApply(availableCredit, subtotal) {
  return cents(Math.min(positive(availableCredit), positive(subtotal)));
}
