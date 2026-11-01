import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";

// Read-only account views for the signed-in client portal: the company's job requests (including ones
// that are not work orders yet) and, for billing contacts and company administrators, its invoices.

async function clientApi(action: string, body?: unknown) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/client?action=${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not load this section.");
  return data;
}

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const when = (value?: string) => (value ? new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

type RequestRow = {
  id: string; requestNumber: string; siteName: string; address: string; requestedDate: string; requestedStart: string; requestedEnd: string;
  status: string; statusLabel: string; note: string; convertedJobId: string; createdAt: string;
};

const CHIP: Record<string, string> = {
  requested: "bg-sky-500/15 text-sky-200",
  reviewing: "bg-sky-500/15 text-sky-200",
  clarification_needed: "bg-amber-500/15 text-amber-200",
  approved: "bg-green-500/15 text-green-200",
  converted: "bg-green-500/15 text-green-200",
  declined: "bg-red-500/15 text-red-200",
};

export function MyRequestsPanel({ onOpenJob }: { onOpenJob: (jobId: string) => void }) {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [error, setError] = useState("");
  const [reply, setReply] = useState<Record<string, string>>({});
  const [sending, setSending] = useState("");
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const load = () => clientApi("requests").then((data) => setRows(data.requests)).catch((e) => setError(e.message));
  useEffect(() => { void load(); }, []);
  const send = async (id: string) => {
    setSending(id);
    setError("");
    try {
      await clientApi("request-reply", { requestId: id, message: reply[id] });
      setSent((s) => ({ ...s, [id]: true }));
      setReply((r) => ({ ...r, [id]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your reply.");
    } finally {
      setSending("");
    }
  };
  if (error && !rows) return <div className="glass-card p-5 text-sm text-red-200">{error}</div>;
  if (!rows) return <div className="glass-card p-5 text-sm text-slate-400">Loading your requests...</div>;
  return (
    <section aria-label="My requests" className="space-y-3">
      {error && <p className="rounded bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
      {rows.length === 0 && <div className="glass-card p-5 text-sm text-slate-400">No requests yet. Use Book a job to send one.</div>}
      {rows.map((row) => (
        <article key={row.id} className="glass-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{row.requestNumber}</p>
              <h3 className="mt-1 text-lg font-bold text-white">{row.siteName || "Service request"}</h3>
              <p className="text-xs text-slate-400">{row.address}</p>
              {row.requestedDate && (
                <p className="mt-1 text-xs text-slate-400">Requested: {when(row.requestedDate)}{row.requestedStart ? ` · ${row.requestedStart}${row.requestedEnd ? `–${row.requestedEnd}` : ""}` : ""}</p>
              )}
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${CHIP[row.status] || CHIP.requested}`}>{row.statusLabel}</span>
          </div>
          {row.note && (
            <p className="mt-3 whitespace-pre-wrap rounded border border-white/10 bg-white/5 p-3 text-sm text-slate-200">{row.note}</p>
          )}
          {row.status === "clarification_needed" && (
            <div className="mt-3">
              <textarea
                value={reply[row.id] || ""}
                onChange={(e) => setReply((r) => ({ ...r, [row.id]: e.target.value }))}
                rows={3}
                maxLength={5000}
                placeholder="Type your reply"
                className="w-full rounded border border-white/10 bg-white/5 p-3 text-sm text-white"
              />
              <div className="mt-2 flex items-center gap-3">
                <button
                  disabled={!reply[row.id]?.trim() || sending === row.id}
                  onClick={() => void send(row.id)}
                  className="rounded bg-tech-green px-4 py-2 text-sm font-bold text-brand-black disabled:opacity-40"
                >
                  {sending === row.id ? "Sending..." : "Send reply"}
                </button>
                {sent[row.id] && <span className="text-xs text-green-300">Reply sent. We will be in touch.</span>}
              </div>
            </div>
          )}
          {row.convertedJobId && (
            <button onClick={() => onOpenJob(row.convertedJobId)} className="mt-3 text-sm font-bold text-tech-green hover:underline">View the job</button>
          )}
        </article>
      ))}
    </section>
  );
}

type InvoiceRow = { id: string; number: string; status: string; issueDate: string; dueDate: string; total: number; balance: number; overdue: boolean; jobNumber: string; paymentLink: string };

export function InvoicesPanel({ supportPhone, supportEmail }: { supportPhone: string; supportEmail: string }) {
  const [data, setData] = useState<{ invoices: InvoiceRow[]; outstandingTotal: number; overdueCount: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { clientApi("invoices").then(setData).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="glass-card p-5 text-sm text-red-200">{error}</div>;
  if (!data) return <div className="glass-card p-5 text-sm text-slate-400">Loading invoices...</div>;
  return (
    <section aria-label="Invoices" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-card p-5">
          <p className="text-3xl font-bold text-white">{money(data.outstandingTotal)}</p>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">Outstanding balance</p>
        </div>
        <div className="glass-card p-5">
          <p className={`text-3xl font-bold ${data.overdueCount ? "text-red-300" : "text-white"}`}>{data.overdueCount}</p>
          <p className="mt-1 text-xs uppercase tracking-wider text-slate-500">Overdue invoices</p>
        </div>
      </div>
      {data.invoices.length === 0 && <div className="glass-card p-5 text-sm text-slate-400">No invoices yet.</div>}
      <div className="space-y-2">
        {data.invoices.map((invoice) => (
          <article key={invoice.id} className="glass-card flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-bold text-white">{invoice.number}{invoice.jobNumber ? <span className="ml-2 font-normal text-slate-400">· {invoice.jobNumber}</span> : null}</p>
              <p className="text-xs text-slate-400">Issued {when(invoice.issueDate) || "n/a"}{invoice.dueDate ? ` · Due ${when(invoice.dueDate)}` : ""}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${invoice.status === "Paid" ? "bg-green-500/15 text-green-200" : invoice.overdue ? "bg-red-500/15 text-red-200" : "bg-sky-500/15 text-sky-200"}`}>{invoice.status}</span>
              <div className="text-right">
                <p className="font-bold text-white">{money(invoice.balance > 0 ? invoice.balance : invoice.total)}</p>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{invoice.balance > 0 ? "Balance due" : "Total"}</p>
              </div>
              {invoice.balance > 0 && (invoice.paymentLink
                ? <a href={invoice.paymentLink} target="_blank" rel="noopener noreferrer" className="rounded bg-tech-green px-4 py-2 text-sm font-bold text-brand-black">Pay online</a>
                : <span className="text-xs text-slate-400">To pay, call {supportPhone} or email {supportEmail}</span>)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** A one-line reminder on the first screen for billing contacts and company administrators. */
export function BalanceNotice({ onView }: { onView: () => void }) {
  const [summary, setSummary] = useState<{ outstandingTotal: number; overdueCount: number } | null>(null);
  useEffect(() => { clientApi("invoices").then(setSummary).catch(() => setSummary(null)); }, []);
  if (!summary || summary.outstandingTotal <= 0) return null;
  return (
    <p className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded p-3 text-sm ${summary.overdueCount ? "bg-red-500/10 text-red-200" : "bg-amber-500/10 text-amber-200"}`}>
      <span>
        You have an outstanding balance of <strong>{money(summary.outstandingTotal)}</strong>
        {summary.overdueCount ? ` (${summary.overdueCount} overdue)` : ""}.
      </span>
      <button type="button" onClick={onView} className="font-bold underline">View invoices</button>
    </p>
  );
}
