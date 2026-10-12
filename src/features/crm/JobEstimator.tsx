import { useMemo, useState } from 'react';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { Plus, Trash2 } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { saveJob } from '../jobs/saveJob';
import { CrmBadge, CrmButton, CrmCard, CrmPageHeader } from './ui';
import { CostingSettingsForm } from './CostingSettingsForm';
import { estimate, pricing, type Verdict } from './job-profit';
import { estimatorPlan, ratesForJob, resolveSettings, type EstimatorInput } from './job-profit-inputs';

// What-if estimator: judge a job before committing to it. Describe the work in
// plain terms and see what the customer pays, what we pay out, and whether it
// clears the target margin. When it looks right, create the job with the plan
// already attached (technicians start as open positions).

type EstimatorCustomer = { id: string; name: string; address?: string; rateAgreement?: { standardRate?: number; nightRate?: number; minimumHours?: number } };

const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const verdictMeta: Record<Verdict, { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' }> = {
  good: { label: 'Worth taking', tone: 'success' },
  thin: { label: 'Thin margin', tone: 'warning' },
  losing: { label: 'Would lose money', tone: 'error' },
  unknown: { label: 'Fill in the details', tone: 'neutral' },
};
const inputClass = 'h-9 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-2.5 text-sm text-crm-ink outline-none focus:border-crm-ink';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-crm-muted';
const tomorrow = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

export function JobEstimator({ customers, settings: rawSettings, canCreate, canEditSettings, onOpenJob }: {
  customers: EstimatorCustomer[];
  settings?: Record<string, unknown> | null;
  canCreate: boolean;
  canEditSettings: boolean;
  onOpenJob: (job: Record<string, unknown> & { id: string }) => void;
}) {
  const settings = useMemo(() => resolveSettings(rawSettings as never), [rawSettings]);
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [form, setForm] = useState({
    techCount: '2', hoursPerDay: '8', days: '1', payRate: '50', travelMode: 'miles' as 'miles' | 'flat', milesPerDay: '0', flatTravel: '0', tollsPerTech: '0',
    date: tomorrow(), shiftStart: '09:00', shiftEnd: '17:00', pricingMode: 'hourly' as 'hourly' | 'fixed', fixedPrice: '', billRate: '', nightRate: '', contingencyPct: '',
  });
  const [supplies, setSupplies] = useState<{ description: string; amount: string }[]>([]);
  const [others, setOthers] = useState<{ label: string; amount: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const set = (change: Partial<typeof form>) => setForm((current) => ({ ...current, ...change }));

  const customer = customers.find((item) => item.id === customerId);
  const agreement = ratesForJob({ id: 'estimate' }, customer);
  const rates = {
    billRate: Number(form.billRate) || agreement.billRate,
    nightRate: Number(form.nightRate) || agreement.nightRate,
    minimumHours: agreement.minimumHours,
  };
  const input: EstimatorInput = {
    techCount: Number(form.techCount) || 0, hoursPerDay: Number(form.hoursPerDay) || 0, days: Number(form.days) || 1, payRate: Number(form.payRate) || 0,
    travelMode: form.travelMode, milesPerDay: Number(form.milesPerDay) || 0, flatTravel: Number(form.flatTravel) || 0, tollsPerTech: Number(form.tollsPerTech) || 0,
    date: form.date, shiftStart: form.shiftStart, shiftEnd: form.shiftEnd, pricingMode: form.pricingMode, fixedPrice: Number(form.fixedPrice) || 0,
    supplies: supplies.map((item) => ({ description: item.description, amount: Number(item.amount) || 0 })),
    otherCosts: others.map((item) => ({ label: item.label, amount: Number(item.amount) || 0 })),
    contingencyPct: form.contingencyPct === '' ? undefined : Number(form.contingencyPct) || 0,
  };
  const costSettings = { mileageRate: settings.mileageRate, overheadPerLaborHour: settings.overheadPerLaborHour, contingencyPct: settings.contingencyPct, targetMarginPct: settings.targetMarginPct };
  const plan = useMemo(() => estimatorPlan(input), [JSON.stringify(input)]); // eslint-disable-line react-hooks/exhaustive-deps
  const result = useMemo(() => estimate(plan, rates, costSettings, 0), [plan, rates.billRate, rates.nightRate, rates.minimumHours, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const price = useMemo(() => pricing(plan, rates, costSettings, settings.targetMarginPct, 0), [plan, rates.billRate, rates.nightRate, rates.minimumHours, settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const meta = verdictMeta[plan.crew.length && result.revenue > 0 ? result.verdict : 'unknown'];

  // Quick sensitivity: how the margin moves if the crew or hours change.
  const scenarios = useMemo(() => [
    { label: 'One fewer technician', plan: estimatorPlan({ ...input, techCount: Math.max(1, input.techCount - 1) }) },
    { label: 'One more technician', plan: estimatorPlan({ ...input, techCount: input.techCount + 1 }) },
    { label: 'Takes 25% longer', plan: estimatorPlan({ ...input, hoursPerDay: Math.round(input.hoursPerDay * 1.25 * 100) / 100 }) },
  ].map((item) => ({ label: item.label, result: estimate(item.plan, rates, costSettings, 0) })), [plan, rates.billRate, rates.nightRate, settings]); // eslint-disable-line react-hooks/exhaustive-deps

  const createJob = async () => {
    if (!customer) { setNotice('Choose a customer first.'); return; }
    if (!name.trim()) { setNotice('Give the job a name.'); return; }
    if (!plan.crew.length) { setNotice('Add at least one technician.'); return; }
    setBusy(true); setNotice('');
    try {
      const job = await saveJob({
        name: name.trim(), workOrderNumber: `WO-${new Date().getFullYear()}-${Date.now().toString().slice(-5)}`, vendorName: customer.name, customerId: customer.id, address: address.trim() || customer.address || undefined, status: 'New',
        hourlyRate: input.payRate, customerBillRate: rates.billRate, customerNightBillRate: rates.nightRate,
        quotedValue: Math.round(result.revenue * 100) / 100,
        targetCompletion: form.date, assignedTechIds: [],
      });
      await updateDoc(doc(db, 'jobs', job.id), { estimatedHours: result.costDetail.hours, schedule: { date: form.date, start: form.shiftStart, end: form.shiftEnd } });
      await setDoc(doc(db, 'job_cost_plans', job.id), JSON.parse(JSON.stringify({ ...plan, jobId: job.id, updatedAt: new Date().toISOString(), updatedBy: auth.currentUser?.email || '', createdFromEstimate: true })));
      setNotice('Job created with this plan attached.');
      onOpenJob(job);
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not create the job.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <CrmPageHeader eyebrow="Sales & billing" title="Job estimator" />
      <p className="max-w-3xl text-sm text-crm-body">Check whether a job is worth taking before you commit. Pay is what each technician earns; the customer's rates come from their rate agreement. Travel, tolls and supplies are billed to the customer at cost.</p>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <CrmCard className="p-4">
            <h3 className="text-sm font-bold text-crm-ink">The job</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><span className={labelClass}>Customer</span>
                <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className={inputClass}>
                  <option value="">Choose a customer</option>
                  {customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label><span className={labelClass}>Job name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Tesla Fremont rack install" className={inputClass} /></label>
              <label className="sm:col-span-2"><span className={labelClass}>Site address (optional)</span><input value={address} onChange={(event) => setAddress(event.target.value)} className={inputClass} /></label>
              <label><span className={labelClass}>First work day</span><input type="date" value={form.date} onChange={(event) => set({ date: event.target.value })} className={inputClass} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label><span className={labelClass}>Start</span><input type="time" value={form.shiftStart} onChange={(event) => set({ shiftStart: event.target.value })} className={inputClass} /></label>
                <label><span className={labelClass}>End</span><input type="time" value={form.shiftEnd} onChange={(event) => set({ shiftEnd: event.target.value })} className={inputClass} /></label>
              </div>
            </div>
          </CrmCard>

          <CrmCard className="p-4">
            <h3 className="text-sm font-bold text-crm-ink">Crew and pay</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label><span className={labelClass}>Technicians</span><input type="number" min="0" max="50" value={form.techCount} onChange={(event) => set({ techCount: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Hours / day</span><input type="number" min="0" step="0.25" value={form.hoursPerDay} onChange={(event) => set({ hoursPerDay: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Days</span><input type="number" min="1" value={form.days} onChange={(event) => set({ days: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Pay $/hr each</span><input type="number" min="0" step="0.5" value={form.payRate} onChange={(event) => set({ payRate: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Travel</span>
                <select value={form.travelMode} onChange={(event) => set({ travelMode: event.target.value as 'miles' | 'flat' })} className={inputClass}>
                  <option value="miles">By miles</option><option value="flat">Flat amount</option>
                </select>
              </label>
              {form.travelMode === 'miles'
                ? <label><span className={labelClass}>Round-trip miles / day</span><input type="number" min="0" value={form.milesPerDay} onChange={(event) => set({ milesPerDay: event.target.value })} className={inputClass} /></label>
                : <label><span className={labelClass}>Flat travel each ($)</span><input type="number" min="0" step="0.01" value={form.flatTravel} onChange={(event) => set({ flatTravel: event.target.value })} className={inputClass} /></label>}
              <label><span className={labelClass}>Tolls each ($)</span><input type="number" min="0" step="0.01" value={form.tollsPerTech} onChange={(event) => set({ tollsPerTech: event.target.value })} className={inputClass} /></label>
              <label><span className={labelClass}>Contingency %</span><input type="number" min="0" placeholder={String(settings.contingencyPct)} value={form.contingencyPct} onChange={(event) => set({ contingencyPct: event.target.value })} className={inputClass} /></label>
            </div>
            {form.travelMode === 'miles' && <p className="mt-2 text-[11px] text-crm-muted">Mileage is paid at ${settings.mileageRate.toFixed(3).replace(/0$/, '')}/mile ({settings.mileageRateIsFederal ? 'federal rate' : 'your custom rate'}).</p>}
          </CrmCard>

          <CrmCard className="p-4">
            <h3 className="text-sm font-bold text-crm-ink">What the customer pays</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              <label className="sm:col-span-2"><span className={labelClass}>Pricing</span>
                <select value={form.pricingMode} onChange={(event) => set({ pricingMode: event.target.value as 'hourly' | 'fixed' })} className={inputClass}>
                  <option value="hourly">Hourly at the customer's rates</option><option value="fixed">Fixed price</option>
                </select>
              </label>
              {form.pricingMode === 'fixed' ? (
                <label className="sm:col-span-2"><span className={labelClass}>Fixed price ($)</span><input type="number" min="0" step="0.01" value={form.fixedPrice} onChange={(event) => set({ fixedPrice: event.target.value })} className={inputClass} /></label>
              ) : (<>
                <label><span className={labelClass}>Bill rate $/hr</span><input type="number" min="0" step="0.5" placeholder={agreement.billRate ? String(agreement.billRate) : 'needed'} value={form.billRate} onChange={(event) => set({ billRate: event.target.value })} className={inputClass} /></label>
                <label><span className={labelClass}>Night/weekend $/hr</span><input type="number" min="0" step="0.5" placeholder={agreement.nightRate ? String(agreement.nightRate) : 'optional'} value={form.nightRate} onChange={(event) => set({ nightRate: event.target.value })} className={inputClass} /></label>
              </>)}
            </div>
            {form.pricingMode === 'hourly' && rates.billRate <= 0 && <p role="alert" className="mt-2 text-xs text-crm-warning-soft-text">Choose a customer with a rate agreement, or type a bill rate.</p>}
            {rates.minimumHours > 0 && form.pricingMode === 'hourly' && <p className="mt-2 text-[11px] text-crm-muted">{rates.minimumHours}-hour minimum per technician applies.</p>}
          </CrmCard>

          <CrmCard className="p-4">
            <h3 className="text-sm font-bold text-crm-ink">Supplies and other costs</h3>
            {([['Supplies', supplies, setSupplies, 'description'], ['Other', others, setOthers, 'label']] as const).map(([title, rows, setRows, field]) => (
              <div key={title} className="mt-3">
                <p className={labelClass}>{title}</p>
                {(rows as { amount: string }[]).map((row, index) => (
                  <div key={index} className="mt-1 flex gap-2">
                    <input placeholder="What" value={(row as unknown as Record<string, string>)[field]} onChange={(event) => (setRows as (value: unknown) => void)((rows as Record<string, string>[]).map((item, i) => (i === index ? { ...item, [field]: event.target.value } : item)))} className={inputClass} />
                    <input type="number" min="0" step="0.01" placeholder="$" value={row.amount} onChange={(event) => (setRows as (value: unknown) => void)((rows as Record<string, string>[]).map((item, i) => (i === index ? { ...item, amount: event.target.value } : item)))} className={`${inputClass} w-28`} />
                    <button type="button" aria-label="Remove" onClick={() => (setRows as (value: unknown) => void)((rows as unknown[]).filter((_, i) => i !== index))} className="text-crm-muted hover:text-crm-error"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => (setRows as (value: unknown) => void)([...(rows as unknown[]), { [field]: '', amount: '' }])} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-crm-ink hover:underline"><Plus className="h-3 w-3" /> Add {title.toLowerCase()}</button>
              </div>
            ))}
          </CrmCard>
        </div>

        <div className="lg:col-span-2">
          <div className="space-y-4 lg:sticky lg:top-4">
            <CrmCard className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-crm-muted">Estimate</p>
                <CrmBadge tone={meta.tone}>{meta.label}</CrmBadge>
              </div>
              <p className={`mt-2 text-3xl font-bold ${result.profit < 0 ? 'text-crm-error' : 'text-crm-ink'}`}>{money(result.profit)}</p>
              <p className="text-xs text-crm-muted">profit · {result.marginPct === null ? '—' : `${result.marginPct.toFixed(1)}%`} margin (target {settings.targetMarginPct}%)</p>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex justify-between"><dt>Customer pays</dt><dd className="font-semibold">{money(result.revenue)}</dd></div>
                <div className="flex justify-between"><dt>We pay out</dt><dd className="font-semibold">{money(result.cost)}</dd></div>
              </dl>
              <dl className="mt-3 space-y-1 border-t border-crm-hairline-soft pt-3 text-xs text-crm-body">
                <div className="flex justify-between"><dt>Labor ({result.costDetail.hours} hrs)</dt><dd>{money(result.costDetail.labor)}</dd></div>
                <div className="flex justify-between"><dt>Travel</dt><dd>{money(result.costDetail.travel)}</dd></div>
                <div className="flex justify-between"><dt>Tolls</dt><dd>{money(result.costDetail.tolls)}</dd></div>
                <div className="flex justify-between"><dt>Supplies</dt><dd>{money(result.costDetail.supplies)}</dd></div>
                <div className="flex justify-between"><dt>Other</dt><dd>{money(result.costDetail.other)}</dd></div>
                {result.costDetail.contingency > 0 && <div className="flex justify-between"><dt>Contingency</dt><dd>{money(result.costDetail.contingency)}</dd></div>}
                {result.costDetail.overhead > 0 && <div className="flex justify-between"><dt>Overhead</dt><dd>{money(result.costDetail.overhead)}</dd></div>}
              </dl>
              <p className="mt-3 text-xs text-crm-muted">To clear {settings.targetMarginPct}% on this cost, quote about <strong className="text-crm-ink">{money(price.priceForTarget)}</strong>{price.billRateForTarget ? <> (bill rate near {money(price.billRateForTarget)}/hr)</> : null}. Break-even is {money(price.breakEvenPrice)}{price.breakEvenBillRate ? <> ({money(price.breakEvenBillRate)}/hr)</> : null}.</p>
            </CrmCard>

            <CrmCard className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-crm-muted">What if…</p>
              <ul className="mt-2 space-y-1 text-xs">
                {scenarios.map((item) => (
                  <li key={item.label} className="flex justify-between"><span>{item.label}</span><span className="font-semibold text-crm-ink">{item.result.marginPct === null ? '—' : `${item.result.marginPct.toFixed(1)}%`} · {money(item.result.profit)}</span></li>
                ))}
              </ul>
            </CrmCard>

            {canCreate ? (
              <div>
                <CrmButton onClick={() => void createJob()} disabled={busy} className="w-full">{busy ? 'Creating…' : 'Create job from this estimate'}</CrmButton>
                <p className="mt-1 text-[11px] text-crm-muted">Creates the job (status New) with this plan attached. Technicians start as open positions you can fill from the job's profit view.</p>
              </div>
            ) : <p className="text-[11px] text-crm-muted">Your role can estimate but not create jobs.</p>}
            {notice && <p role="status" className="rounded-lg bg-crm-surface-soft p-3 text-xs text-crm-ink">{notice}</p>}
          </div>
        </div>
      </div>
      <CostingSettingsForm settings={settings} canEdit={canEditSettings} />
    </div>
  );
}
