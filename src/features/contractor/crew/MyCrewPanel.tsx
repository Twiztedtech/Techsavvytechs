import { useEffect, useState } from 'react';
import { auth } from '../../../lib/firebase';

type CrewEntry = Record<string, any> & { id: string };

async function authedFetch(path: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

const itemTypes: { key: string; label: string; amountKey: string }[] = [
  { key: 'labor', label: 'Labor', amountKey: 'totalHours' },
  { key: 'supplies', label: 'Supplies', amountKey: 'suppliesCost' },
  { key: 'travel', label: 'Travel', amountKey: 'travelCost' },
  { key: 'bonus', label: 'Bonus', amountKey: 'bonusCost' },
];

export function MyCrewPanel() {
  const [entries, setEntries] = useState<CrewEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<CrewEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await authedFetch('/api/portal/time-clock');
      setEntries((data.entries || []).filter((entry: CrewEntry) => entry.status !== 'voided'));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your crew’s timecards.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setItemStatus = async (entry: CrewEntry, itemType: string, status: 'approved' | 'rejected') => {
    const key = `${entry.id}:${itemType}`;
    setBusyKey(key);
    try {
      await authedFetch('/api/portal/time-clock', {
        method: 'POST',
        body: JSON.stringify({ action: 'approve_item', timecardId: entry.id, itemType, status }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update this item.');
    } finally {
      setBusyKey(null);
    }
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setBusyKey(`void:${voidTarget.id}`);
    try {
      await authedFetch('/api/portal/time-clock', {
        method: 'POST',
        body: JSON.stringify({ action: 'void_timecard', timecardId: voidTarget.id, reason: voidReason.trim() }),
      });
      setVoidTarget(null);
      setVoidReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void this submission.');
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) return <p className="text-sm text-slate-400">Loading your crew’s timecards…</p>;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">
        Timecards for jobs you lead. Approve or reject each line item, or void an entry outright.
      </p>
      {error && <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">{error}</div>}
      {entries.length === 0 ? (
        <p className="text-sm text-slate-500">No timecards from your crew yet.</p>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">{entry.technicianName || 'Unknown technician'}</p>
                  <p className="text-[11px] text-slate-500">{entry.jobSite || 'Unknown job'} • {entry.date || 'Unknown date'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setVoidTarget(entry)}
                  className="text-[11px] font-bold text-red-400 hover:text-red-300"
                >
                  Void submission
                </button>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {itemTypes.map(({ key, label, amountKey }) => {
                  const amount = Number(entry[amountKey] || 0);
                  if (!amount) return null;
                  const status = entry[`${key}Status`] || 'pending';
                  const key2 = `${entry.id}:${key}`;
                  return (
                    <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{label}</p>
                        <p className="text-[11px] text-slate-500">{key === 'labor' ? `${amount} hrs` : `$${amount.toFixed(2)}`}</p>
                      </div>
                      {status === 'pending' ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={busyKey === key2}
                            onClick={() => void setItemStatus(entry, key, 'approved')}
                            className="rounded bg-green-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === key2}
                            onClick={() => void setItemStatus(entry, key, 'rejected')}
                            className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${status === 'approved' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                          {status}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h3 className="text-sm font-bold text-slate-100">Void this submission?</h3>
            <p className="mt-1 text-xs text-slate-500">{voidTarget.technicianName} — {voidTarget.jobSite || 'Unknown job'}</p>
            <textarea
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason for voiding"
              rows={3}
              className="mt-3 w-full rounded border border-slate-800 bg-slate-950 p-2 text-xs text-slate-200 outline-none focus:border-amber-500"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => { setVoidTarget(null); setVoidReason(''); }} className="rounded px-3 py-2 text-xs font-bold text-slate-400 hover:text-slate-200">
                Cancel
              </button>
              <button
                type="button"
                disabled={!voidReason.trim() || busyKey === `void:${voidTarget.id}`}
                onClick={() => void submitVoid()}
                className="rounded bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Void submission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
