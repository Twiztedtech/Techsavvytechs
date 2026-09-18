import { useEffect, useRef, useState } from 'react';
import { auth } from '../../../lib/firebase';

type Message = {
  id: string;
  message: string;
  authorName?: string;
  authorRole?: string;
  createdAt?: string;
};

const POLL_MS = 15000;

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

export function JobMessagesPanel({ jobId }: { jobId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await authedFetch(`/api/portal/job-events?action=messages&jobId=${encodeURIComponent(jobId)}`);
      setMessages(data.messages || []);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages.');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!jobId) return;
    setLoaded(false);
    void load();
    const interval = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !jobId) return;
    setSending(true);
    try {
      await authedFetch('/api/portal/job-events?action=messages', {
        method: 'POST',
        body: JSON.stringify({ jobId, message: text }),
      });
      setDraft('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the message.');
    } finally {
      setSending(false);
    }
  };

  if (!jobId) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Team notes for this job</h3>
      <p className="mb-3 text-[11px] text-slate-500">Visible to office staff and other technicians on this job — not the customer.</p>
      {error && <div className="mb-2 rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-400">{error}</div>}
      <div ref={listRef} className="mb-3 max-h-56 space-y-2 overflow-y-auto">
        {!loaded ? (
          <p className="text-xs text-slate-500">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-xs text-slate-500">No notes yet.</p>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className="rounded-lg bg-slate-950 p-2.5">
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                <span className="font-bold text-slate-300">{msg.authorName || 'Unknown'}</span>
                {msg.createdAt && <span>{new Date(msg.createdAt).toLocaleString()}</span>}
              </div>
              <p className="mt-1 text-xs text-slate-200">{msg.message}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Add a note for the team…"
          className="h-9 flex-1 rounded border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 outline-none focus:border-amber-500"
        />
        <button
          type="button"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
          className="rounded bg-amber-500 px-3 text-xs font-bold text-slate-950 disabled:opacity-50"
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
