import { useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { addDoc, collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { Paperclip, Plus, Trash2, X } from 'lucide-react';
import { auth, db, storage } from '../../lib/firebase';
import { CrmBadge, CrmButton, CrmCard, CrmInput } from './ui';
import { CostingSettingsForm } from './CostingSettingsForm';
import { actualToDate, estimate, planCost, pricing, projectedAtCompletion, type CostPlan, type CrewMember, type Verdict } from './job-profit';
import { defaultPlanForJob, materialsRevenue, ratesForJob, resolveSettings, type ProfitCustomer, type ProfitJob } from './job-profit-inputs';

// The Profit panel for one job (Admin, Assistant Admin; Office/Billing can view
// and add expenses). Three views side by side: what the plan says, what has
// happened so far (including work not yet invoiced), and where the job should
// land. Plans and expenses live in their own collections, never on the jobs
// document, so Dispatcher (who can read jobs) never sees pay rates.

type PanelJob = ProfitJob & { name?: string; workOrderNumber?: string; address?: string };
type Tech = { id: string; name?: string; accessStatus?: string; active?: boolean };
export type JobExpense = {
  id: string; jobId?: string; type?: string; amount?: number; date?: string; note?: string; billable?: boolean; status?: string;
  receipt?: { name?: string; url?: string; path?: string; contentType?: string };
  enteredBy?: string; createdAt?: string;
};
type PanelEntry = Parameters<typeof actualToDate>[0]['entries'][number] & { id?: string; technicianName?: string; receipts?: Array<{ name?: string; url?: string }> };
type PanelInvoice = NonNullable<Parameters<typeof actualToDate>[0]['invoices']>[number];

const money = (value: number) => value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}%`);
const verdictMeta: Record<Verdict, { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' }> = {
  good: { label: 'Worth it', tone: 'success' },
  thin: { label: 'Thin margin', tone: 'warning' },
  losing: { label: 'Losing money', tone: 'error' },
  unknown: { label: 'Not enough data', tone: 'neutral' },
};
const inputClass = 'h-9 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-2.5 text-sm text-crm-ink outline-none focus:border-crm-ink';
const selectClass = `${inputClass} pr-6`;
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-crm-muted';

// Firestore rejects undefined, so strip anything that is not set.
const clean = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

export function JobProfitPanel({
  job, customer, technicians, entries, invoices, plan, expenses, settings: rawSettings, canEdit, canSeeActuals, onAssignTechs, onClose,
}: {
  job: PanelJob;
  customer?: ProfitCustomer | null;
  technicians: Tech[];
  entries: PanelEntry[];
  invoices: PanelInvoice[];
  plan: CostPlan | null;
  expenses: JobExpense[];
  settings?: Record<string, unknown> | null;
  canEdit: boolean;
  canSeeActuals: boolean;
  onAssignTechs?: (techIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const settings = useMemo(() => resolveSettings(rawSettings as never), [rawSettings]);
  const techName = (id: string) => technicians.find((tech) => tech.id === id)?.name || id;
  const [draft, setDraft] = useState<CostPlan>(() => plan || defaultPlanForJob(job, customer, techName));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const update = (change: Partial<CostPlan>) => { setDraft((current) => ({ ...current, ...change })); setDirty(true); };
  const updateMember = (index: number, change: Partial<CrewMember>) => update({ crew: draft.crew.map((member, i) => (i === index ? { ...member, ...change } : member)) });

  const rates = ratesForJob(job, customer);
  const materials = materialsRevenue(job);
  const costSettings = { mileageRate: settings.mileageRate, overheadPerLaborHour: settings.overheadPerLaborHour, contingencyPct: settings.contingencyPct, targetMarginPct: settings.targetMarginPct };
  const est = useMemo(() => estimate(draft, rates, costSettings, materials), [draft, rates.billRate, rates.nightRate, rates.minimumHours, materials, settings]);
  const jobExpenses = expenses.filter((expense) => expense.jobId === job.id);
  const actual = useMemo(() => actualToDate({ job, entries, expenses: jobExpenses, invoices, rates, plan: draft, materialsRevenue: materials, settings: costSettings }), [job, entries, jobExpenses, invoices, draft, settings]);
  const projected = useMemo(() => projectedAtCompletion({ job, plan: draft, actual, rates, settings: costSettings, materialsRevenue: materials }), [job, draft, actual, settings]);
  const price = useMemo(() => pricing(draft, rates, costSettings, settings.targetMarginPct, materials), [draft, rates.billRate, settings, materials]);
  const cost = est.costDetail;
  const headline = canSeeActuals && (actual.basis !== 'none' || actual.cost > 0) ? projected : est;
  const headlineLabel = headline === projected ? 'Projected at completion' : 'Estimate';

  const crewIds = new Set(draft.crew.map((member) => member.techId));
  const available = technicians.filter((tech) => !crewIds.has(tech.id) && (tech.accessStatus ? tech.accessStatus === 'Active' : tech.active !== false));

  const savePlan = async () => {
    setBusy(true); setNotice('');
    try {
      await setDoc(doc(db, 'job_cost_plans', job.id), clean({ ...draft, jobId: job.id, updatedAt: new Date().toISOString(), updatedBy: auth.currentUser?.email || '' }));
      setDirty(false); setNotice('Plan saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save the plan.'); }
    finally { setBusy(false); }
  };
  // A crew line created by the estimator before anyone was picked is an open position ("slot-1").
  const isSlot = (techId: string) => techId.startsWith('slot-');
  const realCrewIds = draft.crew.map((member) => member.techId).filter((id) => !isSlot(id));
  const openPositions = draft.crew.length - realCrewIds.length;
  const assign = async () => {
    if (!onAssignTechs || !realCrewIds.length) return;
    if (!window.confirm(`Assign ${realCrewIds.length} technician${realCrewIds.length === 1 ? '' : 's'} to this job? They will see it in their portal.${openPositions ? ` ${openPositions} open position${openPositions === 1 ? ' is' : 's are'} not assigned yet.` : ''}`)) return;
    setBusy(true); setNotice('');
    try { await onAssignTechs(realCrewIds); setNotice('Technicians assigned to the job.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not assign technicians.'); }
    finally { setBusy(false); }
  };

  // ----- expenses -----
  const [expense, setExpense] = useState({ type: 'supplies', amount: '', date: new Date().toISOString().slice(0, 10), note: '', billable: false });
  const [file, setFile] = useState<File | null>(null);
  const addExpense = async (event: FormEvent) => {
    event.preventDefault();
    const amount = Number(expense.amount);
    if (!(amount > 0)) { setNotice('Enter an expense amount.'); return; }
    setBusy(true); setNotice('');
    try {
      let receipt: JobExpense['receipt'];
      if (file) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        const path = `job-receipts/${job.id}/office/${Date.now()}-${safeName}`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, file, { contentType: file.type || 'application/octet-stream' });
        receipt = { name: file.name, url: await getDownloadURL(fileRef), path, contentType: file.type };
      }
      await addDoc(collection(db, 'job_expenses'), clean({ jobId: job.id, type: expense.type, amount, date: expense.date, note: expense.note.trim(), billable: expense.billable, receipt, enteredBy: auth.currentUser?.email || '', createdAt: new Date().toISOString() }));
      setExpense({ ...expense, amount: '', note: '', billable: false }); setFile(null); setNotice('Expense added.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not add the expense (receipts must be an image or PDF under 15 MB).'); }
    finally { setBusy(false); }
  };
  const removeExpense = async (item: JobExpense) => {
    if (!window.confirm('Delete this expense and its receipt?')) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'job_expenses', item.id));
      if (item.receipt?.path) await deleteObject(ref(storage, item.receipt.path)).catch(() => undefined);
    } finally { setBusy(false); }
  };

  const techReceipts = entries.flatMap((entry) => (entry.receipts || []).map((receipt) => ({ ...receipt, by: entry.technicianName || '', date: entry.date })));
  const meta = verdictMeta[headline.verdict];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-crm-canvas p-6 shadow-2xl text-crm-body">
        <div className="flex items-start justify-between border-b border-crm-hairline-soft pb-4">
          <div>
            <p className="font-mono text-[10px] text-crm-ink">{job.workOrderNumber || job.id}</p>
            <h2 className="mt-1 crm-display-sm">Job profit</h2>
            <p className="text-xs text-crm-muted">{job.name || 'Untitled job'}{job.vendorName ? ` · ${job.vendorName}` : ''}</p>
          </div>
          <div className="flex items-center gap-3">
            <CrmBadge tone={meta.tone}>{meta.label}</CrmBadge>
            <button type="button" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {notice && <p role="status" className="mt-3 rounded-lg bg-crm-surface-soft p-3 text-xs text-crm-ink">{notice}</p>}
        {est.revenueDetail.missingBillRate && <p role="alert" className="mt-3 rounded-lg border border-crm-warning/30 bg-crm-warning-soft-bg p-3 text-xs text-crm-warning-soft-text">No customer bill rate is set for this job or customer, so revenue shows $0. Set the bill rate on the job, or the customer's rate agreement.</p>}

        {/* Three views */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { title: 'Estimate', revenue: est.revenue, cost: est.cost, profit: est.profit, margin: est.marginPct, note: 'What the plan says' },
            { title: 'Actual to date', revenue: actual.revenue, cost: actual.cost, profit: actual.profit, margin: actual.marginPct, note: canSeeActuals ? (actual.basis === 'invoiced' ? 'Invoiced' : actual.basis === 'accrued' ? 'Work done, not yet invoiced' : 'No work logged yet') : 'Timecards not visible to your role' },
            { title: 'Projected', revenue: projected.revenue, cost: projected.cost, profit: projected.profit, margin: projected.marginPct, note: canSeeActuals ? `${Math.round(projected.progress * 100)}% of planned hours done` : 'Needs timecards' },
          ].map((column) => (
            <CrmCard key={column.title} className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-crm-muted">{column.title}</p>
              <p className={`mt-2 text-xl font-bold ${column.profit < 0 ? 'text-crm-error' : 'text-crm-ink'}`}>{money(column.profit)}</p>
              <p className="text-xs text-crm-muted">profit · {pct(column.margin)} margin</p>
              <dl className="mt-3 space-y-1 text-xs">
                <div className="flex justify-between"><dt>Customer pays</dt><dd>{money(column.revenue)}</dd></div>
                <div className="flex justify-between"><dt>We pay out</dt><dd>{money(column.cost)}</dd></div>
              </dl>
              <p className="mt-2 text-[10px] text-crm-muted">{column.note}</p>
            </CrmCard>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-crm-muted">
          {headlineLabel}: target margin {settings.targetMarginPct}%. To hit it on this plan, quote about <strong className="text-crm-ink">{money(price.priceForTarget)}</strong>
          {price.billRateForTarget ? <> (a bill rate near {money(price.billRateForTarget)}/hr)</> : null}. Break-even is {money(price.breakEvenPrice)}{price.breakEvenBillRate ? <> ({money(price.breakEvenBillRate)}/hr)</> : null}. Travel, tolls and supplies are billed to the customer at cost, so they never add profit.
        </p>

        {/* Customer pricing */}
        <CrmCard className="mt-5 p-4">
          <h3 className="text-sm font-bold text-crm-ink">What the customer pays</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <label className="sm:col-span-2"><span className={labelClass}>Pricing</span>
              <select disabled={!canEdit} value={draft.pricingMode || 'hourly'} onChange={(event) => update({ pricingMode: event.target.value as 'hourly' | 'fixed' })} className={selectClass}>
                <option value="hourly">Hourly at the customer's rates</option>
                <option value="fixed">Fixed price</option>
              </select>
            </label>
            {draft.pricingMode === 'fixed' ? (
              <label className="sm:col-span-2"><span className={labelClass}>Fixed price ($)</span><input disabled={!canEdit} type="number" min="0" step="0.01" value={draft.fixedPrice ?? ''} onChange={(event) => update({ fixedPrice: Number(event.target.value || 0) })} className={inputClass} /></label>
            ) : (
              <div className="sm:col-span-2 text-xs text-crm-muted">Bill rate {money(rates.billRate)}/hr{rates.nightRate ? `, night/weekend ${money(rates.nightRate)}/hr` : ''}{rates.minimumHours ? `, ${rates.minimumHours}-hr minimum per technician` : ''}. Change these on the job or the customer's rate agreement.</div>
            )}
            <label><span className={labelClass}>First work day</span><input disabled={!canEdit} type="date" value={draft.date || ''} onChange={(event) => update({ date: event.target.value })} className={inputClass} /></label>
            <label><span className={labelClass}>Shift start</span><input disabled={!canEdit} type="time" value={draft.shiftStart || ''} onChange={(event) => update({ shiftStart: event.target.value })} className={inputClass} /></label>
            <label><span className={labelClass}>Shift end</span><input disabled={!canEdit} type="time" value={draft.shiftEnd || ''} onChange={(event) => update({ shiftEnd: event.target.value })} className={inputClass} /></label>
            <label><span className={labelClass}>Contingency %</span><input disabled={!canEdit} type="number" min="0" step="1" value={draft.contingencyPct ?? settings.contingencyPct} onChange={(event) => update({ contingencyPct: Number(event.target.value || 0) })} className={inputClass} /></label>
          </div>
          {materials > 0 && <p className="mt-2 text-xs text-crm-muted">Materials billed to the customer on this job: {money(materials)}.</p>}
        </CrmCard>

        {/* Crew */}
        <CrmCard className="mt-4 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-crm-ink">Crew and what we pay them</h3>
            {canEdit && available.length > 0 && (
              <select value="" onChange={(event) => {
                const tech = technicians.find((item) => item.id === event.target.value);
                if (!tech) return;
                update({ crew: [...draft.crew, { techId: tech.id, name: tech.name || '', payRate: Number(job.hourlyRate || 0), plannedHours: draft.crew[0]?.plannedHours || 8, days: draft.crew[0]?.days || 1, travelMode: 'miles', roundTripMiles: 0, flatTravel: 0, tolls: 0 }] });
              }} className="h-9 rounded-lg border border-crm-hairline bg-crm-canvas px-2 text-xs text-crm-ink">
                <option value="">+ Add technician</option>
                {available.map((tech) => <option key={tech.id} value={tech.id}>{tech.name || tech.id}</option>)}
              </select>
            )}
          </div>
          {draft.crew.length === 0 ? <p className="mt-3 text-xs text-crm-muted">No technicians planned yet. Add one to see cost and profit.</p> : (
            <div className="mt-3 space-y-3">
              {draft.crew.map((member, index) => (
                <div key={member.techId} className="rounded-lg border border-crm-hairline-soft p-3">
                  <div className="flex items-center justify-between">
                    {isSlot(member.techId) ? (
                      canEdit && available.length > 0 ? (
                        <select value="" onChange={(event) => {
                          const tech = technicians.find((item) => item.id === event.target.value);
                          if (tech) updateMember(index, { techId: tech.id, name: tech.name || '' });
                        }} className="h-9 rounded-lg border border-crm-hairline bg-crm-canvas px-2 text-sm font-semibold text-crm-ink">
                          <option value="">{member.name || 'Open position'}: choose a technician…</option>
                          {available.map((tech) => <option key={tech.id} value={tech.id}>{tech.name || tech.id}</option>)}
                        </select>
                      ) : <p className="text-sm font-semibold text-crm-ink">{member.name || 'Open position'} (not assigned)</p>
                    ) : <p className="text-sm font-semibold text-crm-ink">{member.name || techName(member.techId)}</p>}
                    {canEdit && <button type="button" aria-label="Remove technician" onClick={() => update({ crew: draft.crew.filter((_, i) => i !== index) })} className="text-crm-muted hover:text-crm-error"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <label><span className={labelClass}>Pay $/hr</span><input disabled={!canEdit} type="number" min="0" step="0.01" value={member.payRate} onChange={(event) => updateMember(index, { payRate: Number(event.target.value || 0) })} className={inputClass} /></label>
                    <label><span className={labelClass}>Hours/day</span><input disabled={!canEdit} type="number" min="0" step="0.25" value={member.plannedHours} onChange={(event) => updateMember(index, { plannedHours: Number(event.target.value || 0) })} className={inputClass} /></label>
                    <label><span className={labelClass}>Days</span><input disabled={!canEdit} type="number" min="1" step="1" value={member.days ?? 1} onChange={(event) => updateMember(index, { days: Number(event.target.value || 1) })} className={inputClass} /></label>
                    <label><span className={labelClass}>Tolls ($)</span><input disabled={!canEdit} type="number" min="0" step="0.01" value={member.tolls ?? 0} onChange={(event) => updateMember(index, { tolls: Number(event.target.value || 0) })} className={inputClass} /></label>
                    <label><span className={labelClass}>Travel</span>
                      <select disabled={!canEdit} value={member.travelMode || 'miles'} onChange={(event) => updateMember(index, { travelMode: event.target.value as 'miles' | 'flat' })} className={selectClass}>
                        <option value="miles">By miles</option><option value="flat">Flat amount</option>
                      </select>
                    </label>
                    {member.travelMode === 'flat'
                      ? <label><span className={labelClass}>Flat travel ($)</span><input disabled={!canEdit} type="number" min="0" step="0.01" value={member.flatTravel ?? 0} onChange={(event) => updateMember(index, { flatTravel: Number(event.target.value || 0) })} className={inputClass} /></label>
                      : <label><span className={labelClass}>Round-trip miles/day</span><input disabled={!canEdit} type="number" min="0" step="1" value={member.roundTripMiles ?? 0} onChange={(event) => updateMember(index, { roundTripMiles: Number(event.target.value || 0) })} className={inputClass} /></label>}
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11px] text-crm-muted">Mileage is paid at {money(settings.mileageRate)}/mile ({settings.mileageRateIsFederal ? 'the federal rate' : 'your custom rate'}; change it under Costing settings below). Pay rates here are what each technician earns on this job.</p>
        </CrmCard>

        {/* Planned supplies / other */}
        <CrmCard className="mt-4 p-4">
          <h3 className="text-sm font-bold text-crm-ink">Planned supplies and other costs</h3>
          {([['supplies', 'Supplies'], ['otherCosts', 'Other']] as const).map(([key, label]) => {
            const rows = (draft[key] || []) as { description?: string; label?: string; amount: number }[];
            const field = key === 'supplies' ? 'description' : 'label';
            return (
              <div key={key} className="mt-3">
                <p className={labelClass}>{label}</p>
                {rows.map((row, index) => (
                  <div key={index} className="mt-1 flex gap-2">
                    <input disabled={!canEdit} placeholder="What" value={(row as unknown as Record<string, string>)[field] || ''} onChange={(event) => update({ [key]: rows.map((r, i) => (i === index ? { ...r, [field]: event.target.value } : r)) } as Partial<CostPlan>)} className={inputClass} />
                    <input disabled={!canEdit} type="number" min="0" step="0.01" placeholder="$" value={row.amount} onChange={(event) => update({ [key]: rows.map((r, i) => (i === index ? { ...r, amount: Number(event.target.value || 0) } : r)) } as Partial<CostPlan>)} className={`${inputClass} w-28`} />
                    {canEdit && <button type="button" aria-label="Remove" onClick={() => update({ [key]: rows.filter((_, i) => i !== index) } as Partial<CostPlan>)} className="text-crm-muted hover:text-crm-error"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
                {canEdit && <button type="button" onClick={() => update({ [key]: [...rows, { [field]: '', amount: 0 }] } as Partial<CostPlan>)} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-crm-ink hover:underline"><Plus className="h-3 w-3" /> Add {label.toLowerCase()}</button>}
              </div>
            );
          })}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
            <div className="flex justify-between"><dt>Labor</dt><dd>{money(cost.labor)}</dd></div>
            <div className="flex justify-between"><dt>Travel</dt><dd>{money(cost.travel)}</dd></div>
            <div className="flex justify-between"><dt>Tolls</dt><dd>{money(cost.tolls)}</dd></div>
            <div className="flex justify-between"><dt>Supplies</dt><dd>{money(cost.supplies)}</dd></div>
            <div className="flex justify-between"><dt>Other</dt><dd>{money(cost.other)}</dd></div>
            <div className="flex justify-between"><dt>Contingency</dt><dd>{money(cost.contingency)}</dd></div>
            {cost.overhead > 0 && <div className="flex justify-between"><dt>Overhead</dt><dd>{money(cost.overhead)}</dd></div>}
            <div className="flex justify-between font-bold text-crm-ink"><dt>Total ({cost.hours} hrs)</dt><dd>{money(cost.total)}</dd></div>
          </dl>
        </CrmCard>

        {canEdit && (
          <div className="mt-4 flex flex-wrap gap-2">
            <CrmButton onClick={() => void savePlan()} disabled={busy || !dirty}>{busy ? 'Saving…' : dirty ? 'Save plan' : 'Plan saved'}</CrmButton>
            {onAssignTechs && realCrewIds.length > 0 && <CrmButton variant="secondary" onClick={() => void assign()} disabled={busy}>Assign these technicians to the job</CrmButton>}
          </div>
        )}

        {/* Expenses and receipts */}
        <CrmCard className="mt-6 p-4">
          <h3 className="text-sm font-bold text-crm-ink">Expenses and receipts</h3>
          <p className="mt-1 text-[11px] text-crm-muted">Costs a technician types on a timecard are already counted. Add here only what the office paid directly.</p>
          {jobExpenses.length === 0 ? <p className="mt-3 text-xs text-crm-muted">No expenses yet.</p> : (
            <ul className="mt-3 divide-y divide-crm-hairline-soft text-xs">
              {jobExpenses.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <p className="font-semibold text-crm-ink">{money(Number(item.amount || 0))} · {item.type}{item.billable ? ' · billed to customer' : ''}</p>
                    <p className="text-crm-muted">{item.date}{item.note ? ` · ${item.note}` : ''}{item.enteredBy ? ` · ${item.enteredBy}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {item.receipt?.url && <a href={item.receipt.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-crm-ink underline"><Paperclip className="h-3 w-3" /> Receipt</a>}
                    <button type="button" aria-label="Delete expense" onClick={() => void removeExpense(item)} className="text-crm-muted hover:text-crm-error"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {techReceipts.length > 0 && (
            <div className="mt-3">
              <p className={labelClass}>Receipts from technicians</p>
              <ul className="mt-1 space-y-1 text-xs">{techReceipts.map((receipt, index) => <li key={index}><a href={receipt.url} target="_blank" rel="noreferrer" className="font-semibold text-crm-ink underline">{receipt.name || 'Receipt'}</a> <span className="text-crm-muted">{receipt.by}{receipt.date ? ` · ${receipt.date}` : ''}</span></li>)}</ul>
            </div>
          )}
          <form onSubmit={addExpense} className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-6">
            <label className="sm:col-span-1"><span className={labelClass}>Type</span>
              <select value={expense.type} onChange={(event) => setExpense({ ...expense, type: event.target.value })} className={selectClass}>
                {['supplies', 'tolls', 'parking', 'mileage', 'other'].map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label><span className={labelClass}>Amount ($)</span><CrmInput type="number" min="0" step="0.01" value={expense.amount} onChange={(event: ChangeEvent<HTMLInputElement>) => setExpense({ ...expense, amount: event.target.value })} className="!h-9" /></label>
            <label><span className={labelClass}>Date</span><CrmInput type="date" value={expense.date} onChange={(event: ChangeEvent<HTMLInputElement>) => setExpense({ ...expense, date: event.target.value })} className="!h-9" /></label>
            <label className="col-span-2 sm:col-span-3"><span className={labelClass}>Note</span><CrmInput value={expense.note} onChange={(event: ChangeEvent<HTMLInputElement>) => setExpense({ ...expense, note: event.target.value })} className="!h-9" placeholder="Store, what it was for" /></label>
            <label className="col-span-2 sm:col-span-3 text-xs"><span className={labelClass}>Receipt (photo or PDF)</span><input type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-1 block w-full text-xs" /></label>
            <label className="col-span-2 flex items-end gap-2 text-xs sm:col-span-2"><input type="checkbox" checked={expense.billable} onChange={(event) => setExpense({ ...expense, billable: event.target.checked })} /> Bill to the customer at cost</label>
            <div className="col-span-2 flex items-end sm:col-span-1"><CrmButton type="submit" disabled={busy} className="w-full">Add</CrmButton></div>
          </form>
        </CrmCard>
        <CostingSettingsForm settings={settings} canEdit={canEdit} />
      </div>
    </div>
  );
}
