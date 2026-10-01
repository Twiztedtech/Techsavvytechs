// Internal operational alerts: jobs that are overdue to be closed out by the
// technician, and jobs that are closed out but have gone unbilled. These are
// staff-facing (sent to the office, not the customer) -- a different concern
// from the customer-facing reminders in api/contact.js.

// Any status here means the job is past the point where "needs closeout"
// still applies -- it's either already wrapped up, or deliberately not
// trackable this way (voided/cancelled).
const CLOSEOUT_DONE_STATUSES = new Set([
  "completed", "complete", "field complete", "ready to invoice",
  "invoiced", "paid", "voided", "cancelled", "canceled", "closed",
]);
// A job counts as "closed out, awaiting invoice" once it reaches either of
// these -- Ready to Invoice is the normal path once hours are approved;
// Completed covers a job finished but not yet through approval/billing-ready.
const INVOICEABLE_STATUSES = new Set(["completed", "complete", "field complete", "ready to invoice"]);

function toDateOnly(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
function daysBetween(from, to) {
  return Math.floor((to.getTime() - from.getTime()) / 86400000);
}

// Jobs whose scheduled date has passed by more than `graceDays` with no
// closeout (completion) recorded yet -- the technician likely forgot, or the
// job needs rescheduling.
export function jobsNeedingCloseout(jobs, { today = new Date(), graceDays = 2 } = {}) {
  const cutoff = new Date(today); cutoff.setHours(0, 0, 0, 0);
  return (jobs || [])
    .map((job) => {
      const status = String(job.status || "New").toLowerCase();
      if (CLOSEOUT_DONE_STATUSES.has(status)) return null;
      const scheduled = toDateOnly(job.schedule?.date || job.targetCompletion);
      if (!scheduled) return null;
      const daysOverdue = daysBetween(scheduled, cutoff);
      if (daysOverdue < graceDays) return null;
      return { job, daysOverdue, scheduledDate: job.schedule?.date || job.targetCompletion };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

// Jobs that are done (per status) but have no real invoice yet, for at least
// `graceDays`. A deposit invoice doesn't count -- it's billed separately and
// doesn't mean the job itself has been invoiced.
export function jobsNeedingInvoice(jobs, invoices, { today = new Date(), graceDays = 1 } = {}) {
  const cutoff = new Date(today); cutoff.setHours(0, 0, 0, 0);
  const invoicedJobIds = new Set(
    (invoices || []).filter((invoice) => invoice.type !== "deposit" && invoice.jobId).map((invoice) => invoice.jobId),
  );
  return (jobs || [])
    .map((job) => {
      const status = String(job.status || "").toLowerCase();
      if (!INVOICEABLE_STATUSES.has(status)) return null;
      if (invoicedJobIds.has(job.id)) return null;
      const readySince = toDateOnly(job.completedAt || job.billingReadyAt || job.updatedAt);
      const daysWaiting = readySince ? daysBetween(readySince, cutoff) : graceDays;
      if (daysWaiting < graceDays) return null;
      return { job, daysWaiting };
    })
    .filter(Boolean)
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
}
