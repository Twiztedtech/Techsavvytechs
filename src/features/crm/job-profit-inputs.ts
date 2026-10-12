import type { LaborRates } from '../billing/laborLines.ts';
import { actualToDate, estimate, projectedAtCompletion, verdictFor, type CostPlan, type CostSettings, type CrewMember, type Verdict } from './job-profit.ts';

// Glue between a CRM job/customer and the profit engine. Kept free of Firebase
// so it is unit tested like job-profit.ts.

export type ProfitJob = {
  id: string;
  status?: string;
  customerId?: string;
  vendorName?: string;
  hourlyRate?: number;
  customerBillRate?: number;
  customerNightBillRate?: number;
  estimatedHours?: number;
  quotedValue?: number;
  assignedTechIds?: string[];
  schedule?: { date?: string; start?: string; end?: string };
  targetCompletion?: string;
  equipment?: { description?: string; quantity?: string | number; unitPrice?: number; providedBy?: string; fulfillmentSource?: string }[];
};
export type ProfitCustomer = { rateAgreement?: { standardRate?: number; nightRate?: number; minimumHours?: number } };

// The IRS standard business mileage rate (the federal maximum you can reimburse
// per mile without it being taxable), in dollars. It changes at least yearly, and
// in 2026 changed mid-year, so each entry carries the date it takes effect.
// Source: irs.gov/tax-professionals/standard-mileage-rates (Notice 2026-10 set
// 72.5 cents; Announcement 2026-11 raised it to 76 cents from 2026-07-01).
// Add a line here when the IRS announces a new rate. A rate saved in the CRM
// costing settings always overrides this.
export const IRS_MILEAGE_RATES: { from: string; rate: number }[] = [
  { from: '2025-01-01', rate: 0.7 },
  { from: '2026-01-01', rate: 0.725 },
  { from: '2026-07-01', rate: 0.76 },
];

/** The federal mileage rate in effect on a date (YYYY-MM-DD or Date); the newest known rate if the date is later than the table. */
export function irsMileageRate(on: string | Date = new Date()): number {
  const day = typeof on === 'string' ? on.slice(0, 10) : on.toISOString().slice(0, 10);
  let rate = IRS_MILEAGE_RATES[0].rate;
  for (const entry of IRS_MILEAGE_RATES) if (entry.from <= day) rate = entry.rate;
  return rate;
}

export const DEFAULT_COSTING_SETTINGS: Required<Pick<CostSettings, 'targetMarginPct' | 'overheadPerLaborHour' | 'contingencyPct'>> & { homeBaseAddress: string } = {
  targetMarginPct: 30,
  overheadPerLaborHour: 0,
  contingencyPct: 0,
  homeBaseAddress: 'Fairfield, CA 94533',
};

const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Settings document with every missing or invalid value replaced by its default.
 * The mileage rate defaults to the federal (IRS) rate for `today`; a rate saved
 * in the CRM overrides it, and `mileageRateIsFederal` says which one is in use.
 */
export function resolveSettings(raw?: Partial<Record<keyof typeof DEFAULT_COSTING_SETTINGS | 'mileageRate', unknown>> | null, today: string | Date = new Date()) {
  const federal = irsMileageRate(today);
  const merged: typeof DEFAULT_COSTING_SETTINGS & { mileageRate: number; mileageRateIsFederal: boolean; federalMileageRate: number } = { ...DEFAULT_COSTING_SETTINGS, mileageRate: federal, mileageRateIsFederal: true, federalMileageRate: federal };
  if (!raw) return merged;
  const isValid = (value: unknown) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
  if (isValid(raw.mileageRate)) { merged.mileageRate = Number(raw.mileageRate); merged.mileageRateIsFederal = merged.mileageRate === federal; }
  for (const key of ['targetMarginPct', 'overheadPerLaborHour', 'contingencyPct'] as const) {
    if (isValid(raw[key])) merged[key] = Number(raw[key]);
  }
  if (typeof raw.homeBaseAddress === 'string' && raw.homeBaseAddress.trim()) merged.homeBaseAddress = raw.homeBaseAddress.trim();
  return merged;
}

/** What the CUSTOMER is billed: the job's own rate, else the customer's signed rate agreement (as InvoiceModal does). */
export function ratesForJob(job: ProfitJob, customer?: ProfitCustomer | null): LaborRates {
  return {
    billRate: num(job.customerBillRate) || num(customer?.rateAgreement?.standardRate),
    nightRate: num(job.customerNightBillRate) || num(customer?.rateAgreement?.nightRate),
    minimumHours: num(customer?.rateAgreement?.minimumHours),
  };
}

/** Materials the invoice bills the customer for (equipment the client did not supply themselves). */
export function materialsRevenue(job: ProfitJob): number {
  return (job.equipment || [])
    .filter((item) => item.providedBy !== 'client' && item.fulfillmentSource !== 'customer_shipped')
    .reduce((sum, item) => sum + num(item.quantity || 1) * num(item.unitPrice), 0);
}

function hoursBetween(start?: string, end?: string): number {
  const a = /^(\d{1,2}):(\d{2})$/.exec(String(start || ''));
  const b = /^(\d{1,2}):(\d{2})$/.exec(String(end || ''));
  if (!a || !b) return 0;
  const minutes = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  return minutes > 0 ? Math.round((minutes / 60) * 100) / 100 : 0;
}

/**
 * A starting plan built from what the job already says, so the panel is useful
 * the first time it opens: the crew is whoever is assigned (never "ALL"), the
 * hours come from the scheduled shift or the estimated hours, and pay uses the
 * job's pay rate. Everything is editable.
 */
export function defaultPlanForJob(job: ProfitJob, customer?: ProfitCustomer | null, nameFor: (techId: string) => string = () => ''): CostPlan {
  const techIds = (job.assignedTechIds || []).filter((id) => id && id !== 'ALL');
  const shiftHours = hoursBetween(job.schedule?.start, job.schedule?.end);
  const perTech = shiftHours || (techIds.length && num(job.estimatedHours) ? Math.round((num(job.estimatedHours) / techIds.length) * 100) / 100 : 0) || 8;
  const hasBillRate = ratesForJob(job, customer).billRate > 0;
  const crew: CrewMember[] = techIds.map((techId) => ({
    techId,
    name: nameFor(techId),
    payRate: num(job.hourlyRate),
    plannedHours: perTech,
    days: 1,
    travelMode: 'miles',
    roundTripMiles: 0,
    flatTravel: 0,
    tolls: 0,
  }));
  return {
    crew,
    supplies: [],
    otherCosts: [],
    pricingMode: hasBillRate || !num(job.quotedValue) ? 'hourly' : 'fixed',
    fixedPrice: num(job.quotedValue),
    date: job.schedule?.date || job.targetCompletion || '',
    shiftStart: job.schedule?.start || '',
    shiftEnd: job.schedule?.end || '',
  };
}

export type ProfitHeadline = { marginPct: number | null; profit: number; verdict: Verdict; basis: 'projected' | 'actual' | 'estimate' | 'none' };

type SummaryEntry = Parameters<typeof actualToDate>[0]['entries'][number];

/**
 * One headline number per job for lists. Prefers the projection when there is a
 * plan, falls back to what has happened so far, and says which it used.
 */
export function profitHeadline(args: {
  job: ProfitJob;
  customer?: ProfitCustomer | null;
  plan?: CostPlan | null;
  entries: SummaryEntry[];
  invoices: Parameters<typeof actualToDate>[0]['invoices'];
  expenses?: Parameters<typeof actualToDate>[0]['expenses'];
  settings?: CostSettings;
}): ProfitHeadline {
  const { job, customer, plan, settings } = args;
  const rates = ratesForJob(job, customer);
  const materials = materialsRevenue(job);
  const actual = actualToDate({ job, entries: args.entries, expenses: args.expenses, invoices: args.invoices, rates, plan: plan || undefined, materialsRevenue: materials, settings });
  const hasPlan = Boolean(plan && plan.crew?.length);
  if (hasPlan && plan) {
    const projected = projectedAtCompletion({ job, plan, actual, rates, settings, materialsRevenue: materials });
    const hasActivity = actual.basis !== 'none' || actual.cost > 0;
    if (hasActivity || projected.revenue > 0) return { marginPct: projected.marginPct, profit: projected.profit, verdict: projected.verdict, basis: hasActivity ? 'projected' : 'estimate' };
  }
  if (actual.basis !== 'none' || actual.cost > 0) return { marginPct: actual.marginPct, profit: actual.profit, verdict: actual.verdict, basis: 'actual' };
  return { marginPct: null, profit: 0, verdict: verdictFor(null), basis: 'none' };
}

export { estimate };

// ---------------------------------------------------------------------------
// What-if estimator: a job that does not exist yet, described in plain terms
// (how many technicians, how many hours, how far) instead of named people.

export type EstimatorInput = {
  techCount: number;
  hoursPerDay: number;
  days: number;
  payRate: number;
  travelMode: 'miles' | 'flat';
  milesPerDay: number;       // round trip, per technician per day
  flatTravel: number;        // per technician for the whole job
  tollsPerTech: number;      // per technician for the whole job
  date: string;
  shiftStart: string;
  shiftEnd: string;
  pricingMode: 'hourly' | 'fixed';
  fixedPrice: number;
  supplies: { description?: string; amount: number }[];
  otherCosts: { label?: string; amount: number }[];
  contingencyPct?: number;
};

/** Turns estimator answers into a cost plan. Crew lines are open positions ("slot-1"...) until real technicians are picked. */
export function estimatorPlan(input: EstimatorInput): CostPlan {
  const count = Math.max(0, Math.min(50, Math.floor(num(input.techCount))));
  const crew: CrewMember[] = Array.from({ length: count }, (_, index) => ({
    techId: `slot-${index + 1}`,
    name: `Technician ${index + 1}`,
    payRate: num(input.payRate),
    plannedHours: num(input.hoursPerDay),
    days: Math.max(1, Math.floor(num(input.days) || 1)),
    travelMode: input.travelMode,
    roundTripMiles: num(input.milesPerDay),
    flatTravel: num(input.flatTravel),
    tolls: num(input.tollsPerTech),
  }));
  return {
    crew,
    supplies: (input.supplies || []).filter((item) => num(item.amount) > 0),
    otherCosts: (input.otherCosts || []).filter((item) => num(item.amount) > 0),
    pricingMode: input.pricingMode,
    fixedPrice: num(input.fixedPrice),
    contingencyPct: input.contingencyPct,
    date: input.date,
    shiftStart: input.shiftStart,
    shiftEnd: input.shiftEnd,
  };
}
