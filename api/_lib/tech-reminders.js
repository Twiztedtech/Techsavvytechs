// Day-before reminders for the technicians assigned to a scheduled job. The
// customer already gets their own appointment reminder (api/contact.js); this is
// the field-side counterpart. Pure functions only, so they can be unit tested.

// A job in any of these states is finished, cancelled or still a draft, so
// there is nothing for a technician to show up for.
const NOT_UPCOMING_STATUSES = new Set([
  'completed', 'complete', 'field complete', 'ready to invoice', 'invoiced', 'paid',
  'voided', 'cancelled', 'canceled', 'closed', 'draft', 'on hold',
]);

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** '09:00' -> '9:00 AM'. Anything that is not HH:MM is returned as typed. */
export function formatClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return String(value || '').trim();
  const hours = Number(match[1]);
  if (hours > 23) return String(value).trim();
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** 'Mon, Oct 12' for a YYYY-MM-DD date (formatted as a calendar date, no timezone drift). */
export function formatServiceDate(dateOnly) {
  const parsed = new Date(`${dateOnly}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return dateOnly;
  return parsed.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/**
 * Jobs that need a technician reminder for `tomorrow` (YYYY-MM-DD). Returns
 * each job with the specific technician ids to remind. Open-to-everyone jobs
 * ("ALL") and demo jobs are skipped on purpose: the first has no specific
 * crew, the second belongs to the Play review account.
 */
export function jobsNeedingTechReminder(jobs, { tomorrow }) {
  return (jobs || [])
    .map((job) => {
      if (job.isDemo) return null;
      if (NOT_UPCOMING_STATUSES.has(String(job.status || '').toLowerCase())) return null;
      const serviceDate = job.schedule?.date || job.targetCompletion;
      if (serviceDate !== tomorrow) return null;
      const assigned = Array.isArray(job.assignedTechIds) && job.assignedTechIds.length
        ? job.assignedTechIds
        : job.assignedTechId ? [job.assignedTechId] : [];
      if (assigned.includes('ALL')) return null;
      const techIds = [...new Set(assigned.filter(Boolean))];
      if (!techIds.length) return null;
      return { job, techIds, serviceDate };
    })
    .filter(Boolean);
}

/** Subject, email text/html and a short SMS for one technician and one job. */
export function buildTechReminder({ job, technician, serviceDate, appUrl = 'https://techsavvytechs.com' }) {
  const workOrder = job.workOrderNumber || job.id || 'your job';
  const site = job.name || 'the job site';
  const address = job.address && job.address !== 'Address on file' ? job.address : '';
  const dateLabel = formatServiceDate(serviceDate);
  const start = formatClock(job.schedule?.start);
  const end = formatClock(job.schedule?.end);
  const timeLabel = start && end ? `${start} to ${end}` : start || 'time to be confirmed';
  const customer = job.vendorName || '';
  const portalUrl = `${String(appUrl || 'https://techsavvytechs.com').replace(/\/$/, '')}/contractor/dashboard`;
  const mapsUrl = address ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving` : '';
  const firstName = String(technician?.name || '').trim().split(/\s+/)[0] || 'there';

  const lines = [
    `Hi ${firstName}, you are scheduled for tomorrow.`,
    '',
    `${site} (${workOrder})`,
    ...(customer ? [`Customer: ${customer}`] : []),
    `When: ${dateLabel}, ${timeLabel}`,
    ...(address ? [`Where: ${address}`, `Directions: ${mapsUrl}`] : []),
    '',
    'Open the portal for the scope, equipment and site instructions. Clock in when you arrive and log your hours before you leave.',
    portalUrl,
    '',
    "Can't make it? Call (707) 653-6702 tonight.",
  ];

  const row = (label, value) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br/>`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a;line-height:1.55">`
    + `<div style="background:#0b0f0c;padding:20px;color:#fff"><strong style="color:#8DC63F;font-size:20px">TECHSAVVY</strong><div style="font-size:11px;letter-spacing:2px;color:#a7b0a9">JOB TOMORROW</div></div>`
    + `<div style="padding:24px;border:1px solid #e2e8f0"><p>Hi ${escapeHtml(firstName)}, you are scheduled for tomorrow.</p>`
    + `<div style="background:#f8fafc;padding:15px;border-radius:6px;border:1px solid #e2e8f0">${row('Job', `${site} (${workOrder})`)}${customer ? row('Customer', customer) : ''}${row('When', `${dateLabel}, ${timeLabel}`)}${address ? row('Where', address) : ''}</div>`
    + `${mapsUrl ? `<p><a href="${escapeHtml(mapsUrl)}">Get directions</a></p>` : ''}`
    + `<p>Open the portal for the scope, equipment and site instructions. Clock in when you arrive and log your hours before you leave.</p>`
    + `<p><a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#8DC63F;color:#071009;padding:12px 20px;border-radius:5px;text-decoration:none;font-weight:700">Open the portal</a></p>`
    + `<p style="font-size:12px;color:#64748b">Can't make it? Call (707) 653-6702 tonight.</p></div></div>`;

  const sms = `TechSavvy: tomorrow ${dateLabel} ${start || ''} - ${site} (${workOrder})${address ? `, ${address}` : ''}. Details in your portal.`.replace(/\s+/g, ' ');

  return {
    subject: `Tomorrow: ${site} (${dateLabel}, ${start || 'time TBC'})`,
    text: lines.join('\n'),
    html,
    sms,
  };
}
