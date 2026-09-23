import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ClientEquipmentLine, ClientJobDetail } from './types';

type Job = ClientJobDetail['job'];
type Api = (path: string, options?: RequestInit) => Promise<any>;

const blankLine = (): ClientEquipmentLine => ({ description: '', quantity: '1', upc: '', serial: '', notes: '', providedBy: 'client' });
const inputClass = 'mt-1 w-full rounded border border-white/10 bg-black/30 p-2 text-sm text-white';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-slate-500';

export function JobDetailsEditor({ job, api, onSaved, notify }: {
  job: Job;
  api: Api;
  onSaved: () => Promise<void> | void;
  notify: (tone: 'error' | 'success', text: string) => void;
}) {
  const editable = job.editable?.allowed === true;
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ address: '', siteContact: '', notes: '', targetCompletion: '', scopeTasks: '', equipment: [] as ClientEquipmentLine[] });

  const start = () => {
    setForm({
      address: job.address || '',
      siteContact: job.siteContact || '',
      notes: job.notes || '',
      targetCompletion: job.targetCompletion || '',
      scopeTasks: (job.scopeTasks || []).join('\n'),
      equipment: (job.equipment || []).length ? job.equipment!.map((line) => ({ ...line, quantity: String(line.quantity ?? '') })) : [blankLine()],
    });
    setEditing(true);
  };

  const updateLine = (index: number, patch: Partial<ClientEquipmentLine>) =>
    setForm((current) => ({ ...current, equipment: current.equipment.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));

  const save = async () => {
    setSaving(true);
    try {
      const result = await api('/api/client?action=update-job', {
        method: 'POST',
        body: JSON.stringify({
          jobId: job.id,
          changes: {
            address: form.address,
            siteContact: form.siteContact,
            notes: form.notes,
            targetCompletion: form.targetCompletion,
            scopeTasks: form.scopeTasks.split('\n').map((task) => task.trim()).filter(Boolean),
            equipment: form.equipment.filter((line) => line.description.trim()),
          },
        }),
      });
      notify('success', result.changed?.length ? `Saved: ${result.changed.join(', ')}. TechSavvy has been notified.` : 'No changes to save.');
      setEditing(false);
      await onSaved();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'Could not save your changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="glass-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-white">Site, contact &amp; materials</h3>
        {editable && !editing && (
          <button type="button" onClick={start} className="flex items-center gap-1.5 rounded border border-tech-green/40 px-3 py-1.5 text-xs font-bold text-tech-green hover:bg-tech-green/10">
            <Pencil className="h-3.5 w-3.5" /> Edit details
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-4 space-y-4 text-sm text-slate-300">
          <div className="grid gap-3 sm:grid-cols-2">
            <p><span className={labelClass}>Site address</span><span className="mt-1 block">{job.address || 'Not provided yet'}</span></p>
            <p><span className={labelClass}>Site contact</span><span className="mt-1 block">{job.siteContact || 'Not provided yet'}</span></p>
            <p><span className={labelClass}>Requested date</span><span className="mt-1 block">{job.targetCompletion || 'Not provided yet'}</span></p>
          </div>
          {job.notes && <p><span className={labelClass}>Scope summary</span><span className="mt-1 block whitespace-pre-wrap">{job.notes}</span></p>}
          <div>
            <span className={labelClass}>Equipment &amp; materials</span>
            {(job.equipment || []).length === 0 ? (
              <p className="mt-1 text-slate-500">None listed.</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {job.equipment!.map((line, index) => (
                  <li key={`${index}-${line.description}`}>
                    <strong className="text-white">{line.quantity ? `${line.quantity} × ` : ''}{line.description}</strong>{' '}
                    <span className="text-slate-500">
                      — {line.providedBy === 'techsavvy' ? 'TechSavvy provided' : 'Client provided'}
                      {line.upc ? ` · UPC ${line.upc}` : ''}{line.serial ? ` · SN ${line.serial}` : ''}
                    </span>
                    {line.notes && <span className="block text-slate-500">{line.notes}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {!editable && job.editable?.reason && <p className="rounded bg-white/5 p-3 text-xs text-slate-400">{job.editable.reason}</p>}
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <label className={labelClass}>Full site address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className={inputClass} /></label>
          <label className={labelClass}>Site contact (name, phone, email)<input value={form.siteContact} onChange={(e) => setForm({ ...form, siteContact: e.target.value })} className={inputClass} /></label>
          <label className={labelClass}>Requested date<input type="date" value={form.targetCompletion} onChange={(e) => setForm({ ...form, targetCompletion: e.target.value })} className={inputClass} /></label>
          <label className={labelClass}>Scope summary<textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputClass} /></label>
          <label className={labelClass}>Scope tasks (one per line)<textarea rows={5} value={form.scopeTasks} onChange={(e) => setForm({ ...form, scopeTasks: e.target.value })} className={inputClass} /></label>
          <div>
            <div className="flex items-center justify-between">
              <span className={labelClass}>Equipment &amp; materials</span>
              <button type="button" onClick={() => setForm((c) => ({ ...c, equipment: [...c.equipment, blankLine()] }))} className="text-xs font-bold text-tech-green">+ Add item</button>
            </div>
            <div className="mt-2 space-y-2">
              {form.equipment.map((line, index) => (
                <div key={index} className="grid gap-2 rounded border border-white/10 bg-black/20 p-2 md:grid-cols-[1.6fr_70px_1fr_1fr_140px_auto]">
                  <input placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} className={inputClass + ' mt-0'} />
                  <input placeholder="Qty" value={String(line.quantity)} onChange={(e) => updateLine(index, { quantity: e.target.value })} className={inputClass + ' mt-0'} />
                  <input placeholder="UPC" value={line.upc} onChange={(e) => updateLine(index, { upc: e.target.value })} className={inputClass + ' mt-0'} />
                  <input placeholder="Serial #" value={line.serial} onChange={(e) => updateLine(index, { serial: e.target.value })} className={inputClass + ' mt-0'} />
                  <select value={line.providedBy} onChange={(e) => updateLine(index, { providedBy: e.target.value as ClientEquipmentLine['providedBy'] })} className={inputClass + ' mt-0'}>
                    <option value="client">Client provided</option>
                    <option value="techsavvy">TechSavvy provided</option>
                  </select>
                  <button type="button" aria-label="Remove item" onClick={() => setForm((c) => ({ ...c, equipment: c.equipment.filter((_, i) => i !== index) }))} className="px-2 text-red-400">×</button>
                  <input placeholder="Notes" value={line.notes} onChange={(e) => updateLine(index, { notes: e.target.value })} className={inputClass + ' mt-0 md:col-span-6'} />
                </div>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-500">Changes are saved right away and TechSavvy is notified. After the job is scheduled, use “Request scope change” instead.</p>
          <div className="flex gap-2">
            <button type="button" disabled={saving} onClick={() => void save()} className="rounded bg-tech-green px-4 py-2 text-xs font-bold text-brand-black disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded border border-white/10 px-4 py-2 text-xs font-bold text-slate-300">Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
