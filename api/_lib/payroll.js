// Payroll helpers shared by the CRM Payroll screen and the server.
// Dependency-free so both the browser and the API can import it.
//
// Money still moves in QuickBooks (or the bank); the CRM only totals what is
// owed, sends the hours to QuickBooks, and records that a week was paid.

const money = (value) => Math.round(Number(value || 0) * 100) / 100;

// Same fallback rate the QuickBooks sync uses, so the totals here always match
// what was sent to QuickBooks.
const DEFAULT_RATE = 75;

/** Pay for one time entry, counting only approved line items. */
export function entryPay(entry) {
  const hours = Number(entry?.totalHours || 0);
  const rate = Number(entry?.rate || DEFAULT_RATE);
  const approved = (status) => status === 'approved';
  const labor = approved(entry?.laborStatus) ? money(hours * rate) : 0;
  const supplies = approved(entry?.suppliesStatus) ? money(entry?.suppliesCost) : 0;
  const travel = approved(entry?.travelStatus) ? money(entry?.travelCost) : 0;
  const bonus = approved(entry?.bonusStatus) ? money(entry?.bonusCost) : 0;
  return { hours: approved(entry?.laborStatus) ? hours : 0, rate, labor, supplies, travel, bonus, total: money(labor + supplies + travel + bonus) };
}

/** Mirrors timeEntryFullyApproved() in api/portal/time-clock.js. */
export function isFullyApproved(entry) {
  const checks = [
    [Number(entry?.totalHours || 0) > 0, entry?.laborStatus],
    [Number(entry?.suppliesCost || 0) > 0, entry?.suppliesStatus],
    [Number(entry?.travelCost || 0) > 0, entry?.travelStatus],
    [Number(entry?.bonusCost || 0) > 0, entry?.bonusStatus],
  ];
  return checks.every(([active, status]) => !active || status === 'approved');
}

export const isPaid = (entry) => entry?.payout?.status === 'paid';

/**
 * Where an entry stands for payroll:
 *  voided       - never paid
 *  needs_review - something on it is not approved yet
 *  not_in_qbo   - approved but not yet sent to QuickBooks
 *  ready        - in QuickBooks, waiting to be paid
 *  paid         - recorded as paid
 */
export function payrollState(entry) {
  if (entry?.status === 'voided') return 'voided';
  if (isPaid(entry)) return 'paid';
  if (entry?.status !== 'approved' || !isFullyApproved(entry)) return 'needs_review';
  if (entry?.qbStatus !== 'synced') return 'not_in_qbo';
  return 'ready';
}

const isoDate = (date) => date.toISOString().slice(0, 10);

/** Monday-to-Sunday week containing the given YYYY-MM-DD date. */
export function weekRange(dateText) {
  const date = new Date(`${dateText}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required.');
  const offset = (date.getUTCDay() + 6) % 7;
  const start = new Date(date); start.setUTCDate(date.getUTCDate() - offset);
  const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
  return { from: isoDate(start), to: isoDate(end) };
}

export const shiftWeek = (from, weeks) => {
  const date = new Date(`${from}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return weekRange(isoDate(date));
};

/** Entries in the date range (inclusive) and, optionally, on one job. */
export function entriesInPeriod(entries, { from, to, jobId = '' }) {
  return (entries || []).filter((entry) => {
    const date = String(entry?.date || '');
    if (!date || date < from || date > to) return false;
    return !jobId || entry.jobId === jobId;
  });
}

/**
 * Per-technician totals for a set of entries. Voided entries are ignored;
 * every other entry counts toward the total and its state.
 */
export function summarizePayroll(entries, nameFor = (entry) => entry?.technicianName || entry?.technicianUid || 'Unknown technician') {
  const people = new Map();
  for (const entry of entries || []) {
    const state = payrollState(entry);
    if (state === 'voided') continue;
    const key = entry.technicianUid || nameFor(entry);
    const person = people.get(key) || {
      technicianUid: entry.technicianUid || '', name: nameFor(entry), days: new Set(), hours: 0,
      labor: 0, supplies: 0, travel: 0, bonus: 0, total: 0, rates: new Set(),
      counts: { needs_review: 0, not_in_qbo: 0, ready: 0, paid: 0 },
      entryIds: { needs_review: [], not_in_qbo: [], ready: [], paid: [] },
    };
    const pay = entryPay(entry);
    person.days.add(entry.date);
    person.hours += pay.hours;
    person.labor += pay.labor; person.supplies += pay.supplies; person.travel += pay.travel; person.bonus += pay.bonus; person.total += pay.total;
    if (pay.hours > 0) person.rates.add(pay.rate);
    person.counts[state] += 1;
    person.entryIds[state].push(entry.id);
    people.set(key, person);
  }
  const technicians = [...people.values()].map((person) => ({
    ...person,
    days: person.days.size,
    hours: Math.round(person.hours * 100) / 100,
    labor: money(person.labor), supplies: money(person.supplies), travel: money(person.travel), bonus: money(person.bonus), total: money(person.total),
    rates: [...person.rates].sort((a, b) => a - b),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const sum = (field) => money(technicians.reduce((total, person) => total + person[field], 0));
  const count = (state) => technicians.reduce((total, person) => total + person.counts[state], 0);
  return {
    technicians,
    totals: {
      total: sum('total'), labor: sum('labor'), bonus: sum('bonus'), supplies: sum('supplies'), travel: sum('travel'),
      hours: Math.round(technicians.reduce((total, person) => total + person.hours, 0) * 100) / 100,
      needs_review: count('needs_review'), not_in_qbo: count('not_in_qbo'), ready: count('ready'), paid: count('paid'),
    },
  };
}

export const PAYMENT_METHODS = ['QuickBooks direct deposit', 'Bank transfer', 'Check', 'Zelle', 'Other'];

const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const prettyDate = (date) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? String(date || '') : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

/** The "you've been paid" email and text for one technician. */
export function buildPaidNotice({ name, amount, days, hours, from, to, method, paidDate }) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  const period = from === to ? prettyDate(from) : `${prettyDate(from)} to ${prettyDate(to)}`;
  const how = method ? ` by ${method}` : '';
  const when = paidDate ? ` on ${prettyDate(paidDate)}` : '';
  const dayText = `${days} day${days === 1 ? '' : 's'}`;
  const subject = `You've been paid: ${formatMoney(amount)} for ${period}`;
  const text = `Hi ${first},\n\nYour pay of ${formatMoney(amount)} for ${period} (${dayText}, ${hours} hours) was sent${how}${when}. Depending on your bank it can take 1 to 3 business days to arrive.\n\nYou can see each day in the TechSavvy portal under your timecards. If anything looks wrong, reply to this email.\n\nThanks for your work,\nTechSavvy LLC`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#17201a;line-height:1.55"><p>Hi ${escapeHtml(first)},</p><p>Your pay of <strong>${escapeHtml(formatMoney(amount))}</strong> for ${escapeHtml(period)} (${escapeHtml(dayText)}, ${escapeHtml(hours)} hours) was sent${escapeHtml(how)}${escapeHtml(when)}. Depending on your bank it can take 1 to 3 business days to arrive.</p><p>You can see each day in the TechSavvy portal under your timecards. If anything looks wrong, reply to this email.</p><p>Thanks for your work,<br>TechSavvy LLC</p></div>`;
  const sms = `TechSavvy: your pay of ${formatMoney(amount)} for ${period} was sent${how}. Reply STOP to opt out.`;
  return { subject, text, html, sms };
}
