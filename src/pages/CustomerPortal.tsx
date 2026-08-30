import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CalendarDays, CheckCircle2, CircleDollarSign, FileText, HardHat, LifeBuoy, MapPin, ShieldCheck, Wrench, XCircle } from "lucide-react";

type PortalData = {
  preview?: boolean;
  customer: { name: string; contact: string; email: string; phone: string; sites: string[] };
  jobs: { id: string; number: string; title: string; site: string; status: string; technician: string; targetCompletion: string; schedule?: { date?: string; start?: string; end?: string } }[];
  quotes: { id: string; number: string; title: string; site: string; status: string; total: number }[];
  invoices: { id: string; number: string; status: string; issueDate: string; dueDate: string; total: number; balance: number; paymentLink?: string; onlinePaymentEnabled: boolean }[];
  assets: { id: string; name: string; site: string; category: string; manufacturer: string; model: string; serialNumber: string; status: string; nextServiceDate: string }[];
};

const money = (value = 0) => value.toLocaleString(undefined, { style: "currency", currency: "USD" });
const badge = (status: string) => status === "Paid" || status === "Complete" || status === "Accepted" ? "bg-green-100 text-green-800" : status === "Overdue" || status === "Rejected" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700";

export default function CustomerPortal() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") || "", []);
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"overview" | "jobs" | "billing" | "assets" | "request">("overview");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [request, setRequest] = useState({ subject: "", message: "", site: "", preferredDate: "" });

  useEffect(() => {
    if (!token) { setError("This customer portal link is incomplete."); return; }
    fetch(`/api/contact?operation=customer-portal&token=${encodeURIComponent(token)}`)
      .then(async (response) => { const value = await response.json(); if (!response.ok) throw new Error(value.error || "The portal could not be loaded."); setData(value); })
      .catch((reason) => setError(reason.message));
  }, [token]);

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault(); setSending(true);
    try {
      const response = await fetch("/api/contact?operation=portal-service-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, ...request }) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "The service request could not be sent.");
      setSent(true); setRequest({ subject: "", message: "", site: "", preferredDate: "" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The service request could not be sent."); }
    finally { setSending(false); }
  };

  if (error) return <div className="grid min-h-screen place-items-center bg-[#0b0f0c] p-5"><div className="max-w-md rounded border border-red-500/20 bg-[#151916] p-8 text-center text-white"><XCircle className="mx-auto h-10 w-10 text-red-400"/><h1 className="mt-4 font-display text-xl uppercase">Portal unavailable</h1><p className="mt-3 text-sm text-slate-400">{error}</p><a href="mailto:support@techsavvytechs.com" className="mt-5 inline-block text-xs font-bold text-tech-green">Contact TechSavvy support</a></div></div>;
  if (!data) return <div className="grid min-h-screen place-items-center bg-[#0b0f0c] text-sm text-slate-400">Verifying secure portal access…</div>;

  const outstanding = data.invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const nextVisit = data.jobs.find((job) => job.schedule?.date || job.targetCompletion);
  const nav = [["overview", "Overview"], ["jobs", "Jobs"], ["billing", "Quotes & billing"], ["assets", "Assets"], ["request", "Request service"]] as const;
  return <div className="min-h-screen bg-[#eef2ef] text-slate-900">
    <header className="bg-[#0b0f0c] text-white"><div className="mx-auto flex max-w-6xl flex-col justify-between gap-5 px-5 py-6 sm:flex-row sm:items-center"><div><p className="font-display text-xl uppercase text-tech-green">TechSavvy</p><p className="text-[9px] uppercase tracking-[.24em] text-slate-400">Customer Portal</p></div><div className="sm:text-right"><p className="text-xs font-bold">{data.customer.name}</p><p className="text-[10px] text-slate-400">Secure account access</p></div></div></header>
    <nav className="border-b border-slate-200 bg-white"><div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">{nav.map(([id, label]) => <button key={id} onClick={() => setTab(id)} className={`whitespace-nowrap border-b-2 px-4 py-4 text-[10px] font-bold uppercase tracking-wide ${tab === id ? "border-tech-green text-tech-green-deep" : "border-transparent text-slate-400"}`}>{label}</button>)}</div></nav>
    <main className="mx-auto max-w-6xl p-5 sm:p-8">
      {data.preview && <div className="mb-5 flex items-center gap-3 rounded border border-orange-200 bg-orange-50 p-4 text-xs text-orange-800"><ShieldCheck className="h-4 w-4"/><div><b>Administrator preview</b><p className="mt-0.5 text-[10px]">Read-only view. Payments and service-request submission are disabled.</p></div></div>}
      {tab === "overview" && <><div className="mb-6"><h1 className="font-display text-2xl uppercase">Welcome{data.customer.contact ? `, ${data.customer.contact}` : ""}</h1><p className="mt-1 text-xs text-slate-500">Your jobs, equipment, proposals and billing in one place.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Stat icon={HardHat} label="Active jobs" value={String(data.jobs.filter((j) => !["Complete", "Cancelled"].includes(j.status)).length)} detail={nextVisit ? `Next: ${nextVisit.schedule?.date || nextVisit.targetCompletion}` : "No visit scheduled"}/><Stat icon={FileText} label="Open quotes" value={String(data.quotes.filter((q) => !["Accepted", "Rejected"].includes(q.status)).length)} detail="Awaiting a decision"/><Stat icon={CircleDollarSign} label="Balance due" value={money(outstanding)} detail={outstanding ? "Online payment where enabled" : "Account is current"}/><Stat icon={Wrench} label="Managed assets" value={String(data.assets.length)} detail={`${data.assets.filter((a) => a.nextServiceDate).length} on maintenance plans`}/></div>{nextVisit && <section className="mt-6 rounded border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 h-5 w-5 text-tech-green-deep"/><div><p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">Upcoming service</p><h2 className="mt-1 text-sm font-bold">{nextVisit.title}</h2><p className="mt-1 text-xs text-slate-500">{nextVisit.schedule?.date || nextVisit.targetCompletion} {nextVisit.schedule?.start ? `at ${nextVisit.schedule.start}` : ""} · {nextVisit.technician}</p><p className="mt-2 flex items-center gap-1 text-[10px] text-slate-400"><MapPin className="h-3 w-3"/>{nextVisit.site}</p></div></div></section>}</>}
      {tab === "jobs" && <List title="Service jobs" empty="No jobs are available yet.">{data.jobs.map((job) => <Row key={job.id} title={`${job.number} · ${job.title}`} detail={`${job.site}${job.technician ? ` · ${job.technician}` : ""}`} status={job.status} />)}</List>}
      {tab === "billing" && <div className="grid gap-6 lg:grid-cols-2"><List title="Quotes" empty="No quotes are available.">{data.quotes.map((quote) => <Row key={quote.id} title={`${quote.number} · ${quote.title}`} detail={`${quote.site} · ${money(quote.total)}`} status={quote.status}/>)}</List><List title="Invoices" empty="No invoices are available.">{data.invoices.map((invoice) => <div key={invoice.id} className="border-b border-slate-100 p-4 last:border-0"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold">{invoice.number}</p><p className="mt-1 text-[10px] text-slate-400">Due {invoice.dueDate || "—"} · Balance {money(invoice.balance)}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${badge(invoice.status)}`}>{invoice.status}</span></div>{invoice.balance > 0 && (invoice.paymentLink ? <a href={invoice.paymentLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded bg-tech-green px-4 py-2 text-[10px] font-bold text-brand-black">Pay securely with QuickBooks <CircleDollarSign className="h-3.5 w-3.5"/></a> : <p className="mt-3 rounded bg-slate-50 p-2 text-[9px] text-slate-500">Online payment becomes available after this invoice is synced with QuickBooks Payments.</p>)}</div>)}</List></div>}
      {tab === "assets" && <List title="Equipment & maintenance" empty="No customer assets are recorded.">{data.assets.map((asset) => <Row key={asset.id} title={asset.name} detail={`${asset.category} · ${asset.manufacturer} ${asset.model}${asset.nextServiceDate ? ` · Next service ${asset.nextServiceDate}` : ""}`} status={asset.status}/>)}</List>}
      {tab === "request" && <section className="mx-auto max-w-2xl rounded border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><LifeBuoy className="h-5 w-5 text-tech-green-deep"/><div><h2 className="text-sm font-bold">Request service</h2><p className="text-[10px] text-slate-400">Tell our team what you need and when.</p></div></div>{data.preview ? <p className="mt-5 rounded bg-slate-50 p-4 text-xs text-slate-500">Service requests are disabled in administrator preview.</p> : <>{sent && <div className="mt-5 flex items-center gap-2 rounded bg-green-50 p-3 text-xs text-green-800"><CheckCircle2 className="h-4 w-4"/>Your request has been sent to TechSavvy.</div>}<form onSubmit={submitRequest} className="mt-5 space-y-4"><Field label="Subject" value={request.subject} onChange={(value) => setRequest({...request, subject:value})}/><label className="block text-[10px] font-bold uppercase text-slate-500">Site<select value={request.site} onChange={(e) => setRequest({...request, site:e.target.value})} className="mt-1 w-full rounded border border-slate-200 p-3 text-xs font-normal normal-case"><option value="">Select a site</option>{data.customer.sites.map((site) => <option key={site}>{site}</option>)}</select></label><label className="block text-[10px] font-bold uppercase text-slate-500">Preferred date<input type="date" value={request.preferredDate} onChange={(e) => setRequest({...request, preferredDate:e.target.value})} className="mt-1 w-full rounded border border-slate-200 p-3 text-xs font-normal"/></label><label className="block text-[10px] font-bold uppercase text-slate-500">Service details<textarea required rows={5} value={request.message} onChange={(e) => setRequest({...request, message:e.target.value})} className="mt-1 w-full rounded border border-slate-200 p-3 text-xs font-normal normal-case"/></label><button disabled={sending} className="w-full rounded bg-tech-green px-5 py-3 text-xs font-bold text-brand-black disabled:opacity-50">{sending ? "Sending request…" : "Send service request"}</button></form></>}</section>}
      <footer className="mt-10 flex items-center justify-center gap-2 text-[10px] text-slate-400"><ShieldCheck className="h-4 w-4 text-tech-green-deep"/>Secure TechSavvy customer access · support@techsavvytechs.com</footer>
    </main>
  </div>;
}

function Stat({ icon: Icon, label, value, detail }: { icon: typeof HardHat; label: string; value: string; detail: string }) { return <section className="rounded border border-slate-200 bg-white p-4 shadow-sm"><Icon className="h-4 w-4 text-tech-green-deep"/><p className="mt-4 text-[9px] font-bold uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 font-display text-xl">{value}</p><p className="mt-2 text-[9px] text-slate-400">{detail}</p></section>; }
function List({ title, empty, children }: { title: string; empty: string; children: ReactNode }) { const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children); return <section className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 p-4"><h2 className="text-sm font-bold">{title}</h2></header>{hasChildren ? children : <p className="p-6 text-xs text-slate-400">{empty}</p>}</section>; }
function Row({ title, detail, status }: { key?: string; title: string; detail: string; status: string }) { return <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 last:border-0"><div><p className="text-xs font-bold">{title}</p><p className="mt-1 text-[10px] text-slate-400">{detail}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-bold ${badge(status)}`}>{status}</span></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="block text-[10px] font-bold uppercase text-slate-500">{label}<input required value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full rounded border border-slate-200 p-3 text-xs font-normal normal-case"/></label>; }
