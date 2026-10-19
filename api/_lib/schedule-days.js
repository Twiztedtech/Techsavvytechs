// Multi-day job scheduling. Pure functions, no dependencies, so the CRM board, the
// technician app, the reminder cron and the tests all share one definition.
//
// A job's `schedule` is { date, start, end } for a single day (the original shape, still
// valid). A multi-day job adds, without changing those three fields:
//   days:     every scheduled date (YYYY-MM-DD), weekends included only when picked
//   techDays: { [technicianId]: dates } for a technician who works fewer days than the job.
//             A technician with no entry works every day of the job.
// `date` is always the first day, so anything that only knows about `date` keeps working.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;

const toUtc = (dateOnly) => new Date(`${dateOnly}T12:00:00Z`);
const toDateOnly = (utc) => utc.toISOString().slice(0, 10);
const isDate = (value) => typeof value === 'string' && DATE.test(value) && !Number.isNaN(toUtc(value).getTime());

/** Sorted, de-duplicated list of valid YYYY-MM-DD strings. */
export function cleanDays(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(isDate))].sort();
}

/** Every date a job runs on. A legacy single-date job is one day; an unscheduled job is none. */
export function scheduleDays(job) {
  const schedule = job?.schedule;
  const explicit = cleanDays(schedule?.days);
  if (explicit.length) return explicit;
  return isDate(schedule?.date) ? [schedule.date] : [];
}

export const firstDay = (job) => scheduleDays(job)[0] || '';
export const lastDay = (job) => scheduleDays(job).slice(-1)[0] || '';
export const isMultiDay = (job) => scheduleDays(job).length > 1;
export const jobOnDay = (job, day) => scheduleDays(job).includes(day);

/** The days one technician works on a job (the job's days unless that technician has their own list). */
export function techDaysFor(job, techId) {
  const all = scheduleDays(job);
  const own = job?.schedule?.techDays?.[techId];
  if (!Array.isArray(own)) return all;
  const allowed = new Set(all);
  return cleanDays(own).filter((day) => allowed.has(day));
}

export const techOnDay = (job, techId, day) => techDaysFor(job, techId).includes(day);

/**
 * Dates from `from` to `to` inclusive. Weekends are left out unless `weekends` is true,
 * so Mon-Fri is the default and Saturday/Sunday work is one tick away.
 */
export function expandRange(from, to, { weekends = false } = {}) {
  if (!isDate(from)) return [];
  const end = isDate(to) && to >= from ? to : from;
  const days = [];
  for (let cursor = toUtc(from); toDateOnly(cursor) <= end && days.length < 120; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const weekday = cursor.getUTCDay();
    if (weekends || (weekday !== 0 && weekday !== 6)) days.push(toDateOnly(cursor));
  }
  // A single day that lands on a weekend is still honoured: the user picked it.
  return days.length ? days : [from];
}

/**
 * Cleans a schedule before it is saved: valid sorted days, `date` = first day, and per-technician
 * lists only for assigned technicians, only inside the job's days, and only when they differ
 * from the full set (so "everyone works every day" stays the empty, default case).
 */
/** @param {{ start?: string, end?: string, days?: string[], date?: string, techDays?: Record<string, string[]>, assignedTechIds?: string[] }} [input] */
export function normalizeSchedule({ start = '', end = '', days, date, techDays, assignedTechIds = [] } = {}) {
  const list = cleanDays(days);
  const all = list.length ? list : isDate(date) ? [date] : [];
  const schedule = { date: all[0] || '', start, end };
  if (all.length > 1) schedule.days = all;
  const assigned = new Set(assignedTechIds);
  const overrides = {};
  for (const [techId, values] of Object.entries(techDays || {})) {
    if (!assigned.has(techId) || !Array.isArray(values)) continue;
    const mine = cleanDays(values).filter((day) => all.includes(day));
    if (mine.length !== all.length) overrides[techId] = mine;
  }
  if (all.length > 1 && Object.keys(overrides).length) schedule.techDays = overrides;
  return schedule;
}

/** "Day 2 of 5" for a given date, or '' for a single-day job or a date the job is not on. */
export function dayPosition(job, day) {
  const all = scheduleDays(job);
  const index = all.indexOf(day);
  return all.length > 1 && index >= 0 ? { number: index + 1, count: all.length } : null;
}

const short = (dateOnly) =>
  toUtc(dateOnly).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');

/**
 * Short human text for a list of days: "Mon Oct 19" for one day, "Mon Oct 19 to Fri Oct 23"
 * for an unbroken run, and a comma list when there are gaps ("Mon Oct 19, Tue Oct 20, Thu Oct 22").
 * Weekend gaps in an otherwise Mon-Fri run do not count as gaps.
 */
export function describeDays(values) {
  const days = cleanDays(values);
  if (!days.length) return '';
  if (days.length === 1) return short(days[0]);
  const businessDaysBetween = (a, b) => {
    for (let cursor = new Date(toUtc(a).getTime() + DAY_MS); toDateOnly(cursor) < b; cursor = new Date(cursor.getTime() + DAY_MS)) {
      const weekday = cursor.getUTCDay();
      if (weekday !== 0 && weekday !== 6) return false;
    }
    return true;
  };
  const unbroken = days.every((day, index) => index === 0 || businessDaysBetween(days[index - 1], day));
  return unbroken ? `${short(days[0])} to ${short(days[days.length - 1])}` : days.map((day) => short(day)).join(', ');
}
