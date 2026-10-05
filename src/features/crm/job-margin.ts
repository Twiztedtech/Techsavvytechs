import { getEntryTotals } from '../contractor/timesheets/calculations.ts';

type MarginJob = { id: string; quotedValue?: number };
type MarginInvoice = { jobId?: string; total?: number; status?: string };
type MarginEntry = Parameters<typeof getEntryTotals>[0] & { jobId?: string; status?: string };

export type JobMargin = {
  revenue: number;
  cost: number;
  profit: number;
  // null when there isn't enough data to say (no revenue yet, or no cost yet).
  marginPct: number | null;
  basis: 'invoiced' | 'quoted' | 'none';
};

// Live job margin, recomputed from the records every time -- never read from a
// number saved on the job, which goes stale the moment hours or invoices change.
// Revenue is what the customer was billed (all non-voided invoices for the job,
// deposit invoice included, since the final invoice nets it out), falling back
// to the quoted value until an invoice exists. Cost is the direct technician
// payout from non-voided time entries (labor at the PAY rate, plus travel,
// supplies and bonus). Overhead is not included.
export function jobMargin(job: MarginJob, invoices: MarginInvoice[], entries: MarginEntry[]): JobMargin {
  const jobInvoices = invoices.filter((invoice) => invoice.jobId === job.id && !['voided', 'cancelled'].includes(String(invoice.status || '').toLowerCase()));
  const invoiced = jobInvoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const quoted = Number(job.quotedValue || 0);
  const basis: JobMargin['basis'] = jobInvoices.length ? 'invoiced' : quoted > 0 ? 'quoted' : 'none';
  const revenue = basis === 'invoiced' ? invoiced : quoted;
  const cost = entries
    .filter((entry) => entry.jobId === job.id && entry.status !== 'voided' && entry.status !== 'rejected')
    .reduce((sum, entry) => sum + getEntryTotals(entry).totalGross, 0);
  const profit = revenue - cost;
  return { revenue, cost, profit, marginPct: revenue > 0 && cost > 0 ? (profit / revenue) * 100 : null, basis };
}
