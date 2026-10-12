import { useCallback, useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import { communityRequest, timeAgo, type Suggestion } from './api';
import { Badge, ErrorNote, Loading, ghostButton, primaryButton } from './ui';

// Pending "suggest an edit" requests, shown to Technician Leads (on /learn) and to staff (in the CRM).

export function SuggestionReview({ onChanged }: { onChanged?: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(() => communityRequest<{ suggestions: Suggestion[] }>('wiki-suggestions').then((result) => setItems(result.suggestions)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load suggestions.')), []);
  useEffect(() => { void load(); }, [load]);

  async function review(item: Suggestion, approve: boolean, force = false) {
    setBusy(item.id); setError('');
    try {
      const note = approve ? '' : window.prompt('Optional note for the technician (why it was not used):') ?? '';
      await communityRequest('wiki-review-suggestion', { body: { id: item.id, approve, force, note } });
      await load();
      onChanged?.();
    } catch (reason) {
      const text = reason instanceof Error ? reason.message : 'Could not save that decision.';
      if (approve && !force && (reason as { status?: number }).status === 409 && window.confirm(`${text}\n\nApply it anyway?`)) { await review(item, true, true); return; }
      setError(text);
    } finally { setBusy(''); }
  }

  if (!items && !error) return <Loading label="Loading suggestions…" />;
  return (
    <div className="space-y-3">
      <ErrorNote message={error} />
      {items && !items.length && <p className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">No suggestions waiting for review.</p>}
      {items?.map((item) => (
        <div key={item.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <strong className="text-white">{item.pageTitle}</strong>
            {item.outdated && <Badge tone="red">Page changed since</Badge>}
            <span className="text-xs text-slate-500">from {item.authorName} · {timeAgo(item.createdAt)}</span>
          </div>
          {item.note && <p className="mt-2 text-sm text-slate-300">“{item.note}”</p>}
          <button onClick={() => setOpen(open === item.id ? '' : item.id)} className="mt-2 text-xs font-semibold text-amber-400 hover:underline">{open === item.id ? 'Hide the text' : 'Compare the text'}</button>
          {open === item.id && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Current (v{item.currentVersion})</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">{item.currentBody}</pre></div>
              <div><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-amber-400">Suggested</p><pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-500/30 bg-slate-950 p-3 text-xs text-slate-200">{item.proposedBody}</pre></div>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <button disabled={busy === item.id} onClick={() => void review(item, true)} className={primaryButton}><Check size={15} />Approve &amp; publish</button>
            <button disabled={busy === item.id} onClick={() => void review(item, false)} className={ghostButton}><X size={14} />Not now</button>
          </div>
        </div>
      ))}
    </div>
  );
}
