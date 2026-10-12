import { buildLaborLines, type LaborEntry, type LaborRates } from '../billing/laborLines.ts';
import { getEntryTotals } from '../contractor/timesheets/calculations.ts';

// Job profit engine. Pure functions only (no Firebase), like job-margin.ts, so
// every rule is unit tested. Three views of the same job:
//   estimate      what the plan says it should cost and earn
//   actualToDate  what has really happened so far (including work not yet invoiced)
//   projected     actual to date plus the unfinished part of the plan
// Money is "what the customer pays TechSavvy" (revenue) against "what TechSavvy
// pays out" (cost). Overhead is not included unless a per-labor-hour figure is set.

export type CrewMember = {
  techId: string;
  name?: string;
  payRate: number;            // what the technician is paid per hour
  plannedHours: number;       // hours per day
  days?: number;              // number of days worked (default 1)
  travelMode?: 'miles' | 'flat';
  roundTripMiles?: number;    // per day, used when travelMode is 'miles'
  flatTravel?: number;        // total for the job, used when travelMode is 'flat'
  tolls?: number;             // total for the job
};

export type CostPlan = {
  crew: CrewMember[];
  supplies?: { description?: string; amount: number }[];
  otherCosts?: { label?: string; amount: number }[];
  pricingMode?: 'hourly' | 'fixed';
  fixedPrice?: number;
  // Hourly jobs bill planned travel, tolls and supplies to the customer at cost
  // (that is what the invoice does), so they add revenue equal to their cost.
  // Defaults to true; a fixed price already covers them.
  passThrough?: boolean;
  contingencyPct?: number;
  date?: string;              // first work day, YYYY-MM-DD (drives night/weekend pricing)
  shiftStart?: string;        // HH:MM
  shiftEnd?: string;          // HH:MM
};

export type CostSettings = {
  mileageRate?: number;           // dollars per mile
  overheadPerLaborHour?: number;  // optional, defaults to 0
  contingencyPct?: number;        // used when the plan has none
  targetMarginPct?: number;       // default 30
};

export type CostBreakdown = {
  labor: number;
  travel: number;
  tolls: number;
  supplies: number;
  other: number;
  contingency: number;
  overhead: number;
  total: number;
  hours: number;
};

export type PlanRevenue = {
  total: number;
  labor: number;
  passThrough: number;
  materials: number;
  lines: ReturnType<typeof buildLaborLines>;
  missingBillRate: boolean;
};

export type Verdict = 'good' | 'thin' | 'losing' | 'unknown';

export type ProfitColumn = {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number | null;   // null when there is no revenue to measure against
  verdict: Verdict;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isVoid = (status?: string) => ['voided', 'cancelled', 'canceled', 'rejected'].includes(String(status || '').toLowerCase());
const isDone = (status?: string) => ['completed', 'complete', 'field complete', 'ready to invoice', 'invoiced', 'paid', 'closed'].includes(String(status || '').toLowerCase());

function addDays(dateOnly: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** Hours worked per day per technician, turned into the entries the invoice would be priced from. */
export function plannedEntries(plan: CostPlan): LaborEntry[] {
  const entries: LaborEntry[] = [];
  for (const member of plan.crew || []) {
    const days = Math.max(1, Math.floor(num(member.days) || 1));
    const hours = num(member.plannedHours);
    if (hours <= 0) continue;
    for (let day = 0; day < days; day += 1) {
      entries.push({
        date: plan.date ? addDays(plan.date, day) : `Day ${day + 1}`,
        clockIn: plan.shiftStart,
        clockOut: plan.shiftEnd,
        totalHours: hours,
      });
    }
  }
  return entries;
}

/** What the customer is expected to pay: hourly (priced exactly like the invoice) or a fixed price. */
export function planRevenue(plan: CostPlan, rates: LaborRates, materialsRevenue = 0, settings: CostSettings = {}): PlanRevenue {
  const materials = round2(num(materialsRevenue));
  if (plan.pricingMode === 'fixed') {
    const labor = round2(num(plan.fixedPrice));
    return { total: round2(labor + materials), labor, passThrough: 0, materials, lines: [], missingBillRate: false };
  }
  const lines = buildLaborLines(plannedEntries(plan), rates);
  const labor = round2(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0));
  const cost = planCost(plan, settings);
  const passThrough = plan.passThrough === false ? 0 : round2(cost.travel + cost.tolls + cost.supplies);
  const hasHours = lines.length > 0;
  return { total: round2(labor + passThrough + materials), labor, passThrough, materials, lines, missingBillRate: hasHours && num(rates.billRate) <= 0 };
}

/** What TechSavvy is expected to pay out for the plan. */
export function planCost(plan: CostPlan, settings: CostSettings = {}): CostBreakdown {
  const mileageRate = num(settings.mileageRate);
  let labor = 0;
  let travel = 0;
  let tolls = 0;
  let hours = 0;
  for (const member of plan.crew || []) {
    const days = Math.max(1, Math.floor(num(member.days) || 1));
    const memberHours = num(member.plannedHours) * days;
    hours += memberHours;
    labor += memberHours * num(member.payRate);
    travel += member.travelMode === 'flat' ? num(member.flatTravel) : num(member.roundTripMiles) * days * mileageRate;
    tolls += num(member.tolls);
  }
  const supplies = (plan.supplies || []).reduce((sum, item) => sum + num(item.amount), 0);
  const other = (plan.otherCosts || []).reduce((sum, item) => sum + num(item.amount), 0);
  const direct = labor + travel + tolls + supplies + other;
  const contingencyPct = plan.contingencyPct ?? settings.contingencyPct ?? 0;
  const contingency = direct * (num(contingencyPct) / 100);
  const overhead = hours * num(settings.overheadPerLaborHour);
  return {
    labor: round2(labor),
    travel: round2(travel),
    tolls: round2(tolls),
    supplies: round2(supplies),
    other: round2(other),
    contingency: round2(contingency),
    overhead: round2(overhead),
    total: round2(direct + contingency + overhead),
    hours: round2(hours),
  };
}

/** good / thin / losing against the target margin; unknown until there is revenue to measure against. */
export function verdictFor(marginPct: number | null, targetMarginPct = 30): Verdict {
  if (marginPct === null) return 'unknown';
  if (marginPct >= targetMarginPct) return 'good';
  if (marginPct >= targetMarginPct / 2) return 'thin';
  return 'losing';
}

function column(revenue: number, cost: number, target?: number): ProfitColumn {
  const profit = round2(revenue - cost);
  const marginPct = revenue > 0 ? round2((profit / revenue) * 100) : null;
  return { revenue: round2(revenue), cost: round2(cost), profit, marginPct, verdict: verdictFor(marginPct, target) };
}

export type Estimate = ProfitColumn & { revenueDetail: PlanRevenue; costDetail: CostBreakdown };

export function estimate(plan: CostPlan, rates: LaborRates, settings: CostSettings = {}, materialsRevenue = 0): Estimate {
  const revenueDetail = planRevenue(plan, rates, materialsRevenue, settings);
  const costDetail = planCost(plan, settings);
  return { ...column(revenueDetail.total, costDetail.total, settings.targetMarginPct), revenueDetail, costDetail };
}

type ActualEntry = Parameters<typeof getEntryTotals>[0] & {
  jobId?: string; status?: string; date?: string; clockIn?: string; clockOut?: string;
};
// billable: the office passes this cost on to the customer at cost (e.g. a toll).
type ActualExpense = { jobId?: string; amount?: number | string; status?: string; billable?: boolean };
type ActualInvoice = { jobId?: string; total?: number | string; status?: string };
type ActualJob = { id: string; status?: string };

export type Actual = ProfitColumn & {
  basis: 'invoiced' | 'accrued' | 'none';
  invoiced: number;
  accrued: number;
  hours: number;
  expenses: number;
};

/**
 * What has really happened so far. Cost is every non-void timecard (labor at
 * that entry's own pay rate, plus the supplies/travel/bonus typed on it) plus
 * costs the office entered directly. Revenue is what was invoiced; until an
 * invoice exists it is the work done so far priced at the customer's rates, so
 * profit is visible before the job is finished or billed.
 */
export function actualToDate(args: {
  job: ActualJob;
  entries: ActualEntry[];
  expenses?: ActualExpense[];
  invoices?: ActualInvoice[];
  rates: LaborRates;
  plan?: CostPlan;
  materialsRevenue?: number;
  settings?: CostSettings;
}): Actual {
  const { job, rates, settings = {} } = args;
  const entries = (args.entries || []).filter((entry) => entry.jobId === job.id && !isVoid(entry.status));
  const expenses = (args.expenses || []).filter((expense) => expense.jobId === job.id && !isVoid(expense.status));
  const invoices = (args.invoices || []).filter((invoice) => invoice.jobId === job.id && !isVoid(invoice.status));

  const hours = entries.reduce((sum, entry) => sum + num(entry.totalHours), 0);
  const entryCost = entries.reduce((sum, entry) => sum + getEntryTotals(entry).totalGross, 0);
  const expenseCost = expenses.reduce((sum, expense) => sum + num(expense.amount), 0);
  const overhead = hours * num(settings.overheadPerLaborHour);
  const cost = entryCost + expenseCost + overhead;

  const invoiced = invoices.reduce((sum, invoice) => sum + num(invoice.total), 0);
  let accrued = 0;
  if (args.plan?.pricingMode === 'fixed') {
    // A fixed price is earned as the work progresses (capped at 100%).
    const plannedHours = planCost(args.plan, settings).hours;
    const progress = isDone(job.status) ? 1 : plannedHours > 0 ? Math.min(1, hours / plannedHours) : 0;
    accrued = num(args.plan.fixedPrice) * progress;
  } else {
    accrued = buildLaborLines(entries as LaborEntry[], rates).reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    // The invoice also bills approved travel and supplies from the timecards at cost,
    // plus office expenses marked billable (what InvoiceModal does).
    if (args.plan?.passThrough !== false) {
      accrued += entries.reduce((sum, entry) => sum + num(entry.travelCost) + num(entry.suppliesCost), 0);
      accrued += expenses.filter((expense) => expense.billable).reduce((sum, expense) => sum + num(expense.amount), 0);
    }
  }
  accrued += num(args.materialsRevenue);
  const basis: Actual['basis'] = invoices.length ? 'invoiced' : accrued > 0 ? 'accrued' : 'none';
  const revenue = basis === 'invoiced' ? invoiced : accrued;
  return {
    ...column(revenue, cost, settings.targetMarginPct),
    basis,
    invoiced: round2(invoiced),
    accrued: round2(accrued),
    hours: round2(hours),
    expenses: round2(expenseCost),
  };
}

/**
 * Where the job should land: what has happened plus the part of the plan not
 * yet done. A finished job is simply its actuals. Progress is measured in hours.
 */
export function projectedAtCompletion(args: {
  job: ActualJob;
  plan: CostPlan;
  actual: Actual;
  rates: LaborRates;
  settings?: CostSettings;
  materialsRevenue?: number;
}): ProfitColumn & { progress: number } {
  const { job, plan, actual, rates, settings = {} } = args;
  if (isDone(job.status)) return { ...column(actual.basis === 'none' ? 0 : actual.basis === 'invoiced' ? actual.invoiced : actual.accrued, actual.cost, settings.targetMarginPct), progress: 1 };
  const plannedCost = planCost(args.plan, settings);
  const plannedRevenue = planRevenue(plan, rates, args.materialsRevenue, settings);
  const progress = plannedCost.hours > 0 ? Math.min(1, actual.hours / plannedCost.hours) : 0;
  const remaining = 1 - progress;
  const earned = actual.basis === 'invoiced' ? actual.invoiced : actual.accrued;
  const revenue = plan.pricingMode === 'fixed' ? plannedRevenue.total : earned + plannedRevenue.total * remaining;
  const cost = actual.cost + plannedCost.total * remaining;
  return { ...column(revenue, cost, settings.targetMarginPct), progress: round2(progress) };
}

/**
 * The price (and hourly bill rate) needed to hit a target margin on this plan's
 * cost, plus the break-even point. Rates scale together, so night and weekend
 * hours keep their relationship to the standard rate.
 */
export function pricing(plan: CostPlan, rates: LaborRates, settings: CostSettings = {}, targetMarginPct = settings.targetMarginPct ?? 30, materialsRevenue = 0) {
  const cost = planCost(plan, settings).total;
  const revenue = planRevenue(plan, rates, 0, settings);
  const base = revenue.labor;
  // Billed materials and pass-through travel/supplies are paid back by the customer,
  // so only the rest of the cost has to be earned through the hourly rate.
  const materials = num(materialsRevenue) + revenue.passThrough;
  const target = Math.min(Math.max(num(targetMarginPct), 0), 95);
  const priceForTarget = round2(cost / (1 - target / 100));
  const hourly = plan.pricingMode !== 'fixed' && base > 0 && num(rates.billRate) > 0;
  // Labor has to cover whatever the billed materials do not.
  const laborNeeded = (price: number) => Math.max(0, price - materials);
  return {
    breakEvenPrice: round2(cost),
    priceForTarget,
    breakEvenBillRate: hourly ? round2(num(rates.billRate) * (laborNeeded(cost) / base)) : null,
    billRateForTarget: hourly ? round2(num(rates.billRate) * (laborNeeded(priceForTarget) / base)) : null,
  };
}
