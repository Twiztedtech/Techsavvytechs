import { describeDays, techDaysFor } from '../../../../api/_lib/schedule-days.js';

// The technician's own assigned days, so they can see where they are expected without asking.
// Days come from the job's schedule (multi-day jobs and any days the office took them off).

type ScheduledJob = {
  id: string;
  name?: string;
  vendorName?: string;
  workOrderNumber?: string;
  status?: string;
  address?: string;
  assignedTechId?: string;
  assignedTechIds?: string[];
  schedule?: { date?: string; start?: string; end?: string; days?: string[]; techDays?: Record<string, string[]> };
};

const CLOSED = new Set(['voided', 'completed', 'complete', 'closed', 'cancelled', 'canceled', 'ready to invoice', 'invoiced', 'paid']);
const localToday = () => new Date().toLocaleDateString('en-CA');
const addDays = (day: string, count: number) => new Date(new Date(`${day}T12:00:00Z`).getTime() + count * 86400000).toISOString().slice(0, 10);

function clock(value?: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return '';
  const hours = Number(match[1]);
  return `${hours % 12 || 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`;
}

/** Days this technician works on a job (all of the job's days unless the office set their own). */
export function myDaysFor(job: ScheduledJob, technicianId?: string): string[] {
  return techDaysFor(job, technicianId || '') as string[];
}

/** "Your days: Mon Oct 19 to Fri Oct 23" for the selected job, or '' when the job has no schedule. */
export function myDaysSummary(job: ScheduledJob, technicianId?: string): string {
  const days = myDaysFor(job, technicianId);
  return days.length ? describeDays(days) : '';
}

export function MyScheduleCard({ jobs, technicianId }: { jobs: ScheduledJob[]; technicianId?: string }) {
  const today = localToday();
  const horizon = Array.from({ length: 7 }, (_, index) => addDays(today, index));
  // Only work the technician is personally assigned to (not "open to anyone" jobs).
  const mine = (job: ScheduledJob) => !technicianId || job.assignedTechIds?.includes(technicianId) || job.assignedTechId === technicianId;
  const open = jobs.filter((job) => !CLOSED.has(String(job.status || '').toLowerCase()) && mine(job));
  const rows = horizon
    .map((day) => ({ day, items: open.filter((job) => myDaysFor(job, technicianId).includes(day)) }))
    .filter((row) => row.items.length > 0);
  if (!rows.length) return null;
  const label = (day: string) => (day === today ? 'Today' : new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }));
  return (
    <section aria-label="Your schedule this week" className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
      <h3 className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Your schedule, next 7 days</h3>
      <ul className="space-y-1.5">
        {rows.map(({ day, items }) => items.map((job) => (
          <li key={`${day}-${job.id}`} className="flex flex-wrap items-baseline gap-x-3 text-xs">
            <span className={`w-24 shrink-0 font-bold ${day === today ? 'text-amber-400' : 'text-slate-300'}`}>{label(day)}</span>
            <span className="text-slate-200">{job.name || job.vendorName || job.workOrderNumber || 'Job'}</span>
            {(job.schedule?.start || job.schedule?.end) && <span className="text-slate-500 font-mono">{clock(job.schedule?.start)}{job.schedule?.end ? ` to ${clock(job.schedule?.end)}` : ''}</span>}
          </li>
        )))}
      </ul>
    </section>
  );
}
