import { useState } from 'react';
import { deleteField, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { CrmButton } from './ui';
import type { resolveSettings } from './job-profit-inputs';

// The numbers behind every profit view: target margin, mileage rate, overhead,
// default contingency and the home base trips start from. The mileage rate
// follows the federal (IRS) rate unless it is changed here.

type Resolved = ReturnType<typeof resolveSettings>;
const inputClass = 'h-9 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-2.5 text-sm text-crm-ink outline-none focus:border-crm-ink';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-wide text-crm-muted';
const cents = (rate: number) => `${(rate * 100).toFixed(1).replace(/\.0$/, '')}¢`;

export function CostingSettingsForm({ settings, canEdit }: { settings: Resolved; canEdit: boolean }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(String(settings.targetMarginPct));
  const [mileage, setMileage] = useState(String(settings.mileageRate));
  const [overhead, setOverhead] = useState(String(settings.overheadPerLaborHour));
  const [contingency, setContingency] = useState(String(settings.contingencyPct));
  const [home, setHome] = useState(settings.homeBaseAddress);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const save = async (useFederal = false) => {
    setBusy(true); setNotice('');
    try {
      const rate = Number(mileage);
      await setDoc(doc(db, 'costing_settings', 'default'), {
        targetMarginPct: Number(target) || 0,
        overheadPerLaborHour: Number(overhead) || 0,
        contingencyPct: Number(contingency) || 0,
        homeBaseAddress: home.trim(),
        // Leaving the rate unset keeps it tracking the federal rate as the IRS changes it.
        mileageRate: useFederal || !(rate >= 0) || rate === settings.federalMileageRate ? deleteField() : rate,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || '',
      }, { merge: true });
      if (useFederal) setMileage(String(settings.federalMileageRate));
      setNotice(useFederal ? 'Using the federal rate.' : 'Settings saved.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save settings.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-6 rounded-xl border border-crm-hairline p-4">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="text-sm font-bold text-crm-ink">Costing settings</span>
        <span className="text-xs text-crm-muted">Target {settings.targetMarginPct}% · mileage {cents(settings.mileageRate)}/mi {settings.mileageRateIsFederal ? '(federal)' : '(custom)'} · {open ? 'hide' : 'edit'}</span>
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label><span className={labelClass}>Target margin %</span><input disabled={!canEdit} type="number" min="0" max="95" step="1" value={target} onChange={(event) => setTarget(event.target.value)} className={inputClass} /></label>
          <label><span className={labelClass}>Mileage rate ($ per mile)</span><input disabled={!canEdit} type="number" min="0" step="0.005" value={mileage} onChange={(event) => setMileage(event.target.value)} className={inputClass} />
            <span className="mt-1 block text-[11px] text-crm-muted">Federal (IRS) maximum today: {cents(settings.federalMileageRate)} per mile. {settings.mileageRateIsFederal ? 'This follows the federal rate automatically.' : 'You have set your own rate.'}</span>
          </label>
          <label><span className={labelClass}>Overhead per labor hour ($)</span><input disabled={!canEdit} type="number" min="0" step="0.5" value={overhead} onChange={(event) => setOverhead(event.target.value)} className={inputClass} /><span className="mt-1 block text-[11px] text-crm-muted">Optional. 0 means margins are before overhead.</span></label>
          <label><span className={labelClass}>Default contingency %</span><input disabled={!canEdit} type="number" min="0" step="1" value={contingency} onChange={(event) => setContingency(event.target.value)} className={inputClass} /></label>
          <label className="sm:col-span-2"><span className={labelClass}>Home base (trips start here)</span><input disabled={!canEdit} value={home} onChange={(event) => setHome(event.target.value)} className={inputClass} /></label>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
              <CrmButton onClick={() => void save(false)} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</CrmButton>
              {!settings.mileageRateIsFederal && <CrmButton variant="secondary" onClick={() => void save(true)} disabled={busy}>Use federal rate ({cents(settings.federalMileageRate)})</CrmButton>}
              {notice && <span role="status" className="text-xs text-crm-ink">{notice}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
