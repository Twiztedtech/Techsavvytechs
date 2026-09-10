import { useEffect, useState } from 'react';
import { auth } from '../../../lib/firebase';

type Delivery = {
  id: string;
  channel: 'email' | 'sms';
  type: string;
  status: string;
  recipients?: string[];
  recipientHash?: string;
  error?: string;
  createdAt: string;
};

const statusStyles: Record<string, string> = {
  accepted: 'text-green-400',
  failed: 'text-red-400',
  deferred_quiet_hours: 'text-amber-400',
  opted_out: 'text-slate-500',
};

export function NotificationHistoryPanel({ jobId }: { jobId: string }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch(`/api/portal/time-clock?action=notifications&jobId=${encodeURIComponent(jobId)}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (response.ok) setDeliveries(data.deliveries || []);
    } catch (error) {
      console.error('Could not load notification history:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [jobId]);

  const retry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    setNotice('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/portal/time-clock', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'retry_notification', deliveryId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Retry failed.');
      setNotice('Retry sent.');
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Retry failed.');
    } finally {
      setRetryingId(null);
    }
  };

  if (loading) return <p className="text-[10px] text-slate-500">Loading notification history…</p>;
  if (!deliveries.length) return <p className="text-[10px] text-slate-500">No notifications recorded for this work order yet.</p>;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-slate-300"><span>🔔</span> Notification history</h4>
      {notice && <p className="mb-2 text-[10px] text-amber-400">{notice}</p>}
      <div className="space-y-1.5">
        {deliveries.map((delivery) => (
          <div key={delivery.id} className="flex items-center justify-between gap-2 rounded bg-slate-900 px-2.5 py-1.5 text-[10px]">
            <span className="text-slate-400">{delivery.channel === 'sms' ? '📱' : '✉️'} {delivery.type}</span>
            <span className={statusStyles[delivery.status] || 'text-slate-400'}>{delivery.status.replace(/_/g, ' ')}</span>
            <span className="text-slate-600">{new Date(delivery.createdAt).toLocaleString()}</span>
            {delivery.status === 'failed' && (
              <button type="button" disabled={retryingId === delivery.id} onClick={() => void retry(delivery.id)} className="rounded border border-amber-500/30 px-2 py-0.5 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50">
                {retryingId === delivery.id ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
