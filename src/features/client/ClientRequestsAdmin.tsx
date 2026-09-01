import React, { useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, RefreshCw, UserPlus } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { ClientCompanyEditor } from './ClientCompanyEditor';
import { ClientPortalConfiguration } from './ClientPortalConfiguration';

type RequestRecord = Record<string, any> & { id: string; requestNumber: string; companyName: string; siteName: string; status: string; requesterEmail: string; requestedWindows: Array<{ date: string; start: string; end: string }> };
type ContractorOption = { id: string; name: string; email: string };
type Personnel = { id?: string; name: string; email: string; role: string };
type Organization = { id: string; name: string; personnel?: Personnel[]; billingRecipientEmails?: string[] };
export type AdminActionResult = { ok: true; data: any } | { ok: false; error: string };

async function adminApi(action: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(`/api/admin/client-portal?action=${action}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Admin request failed.');
  return data;
}

const uniqueEmails = (values: string[]) => [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];

export function ClientRequestsAdmin({ contractors }: { contractors: ContractorOption[] }) {
  const [data, setData] = useState<any>({ requests: [], organizations: [], users: [], appointments: [], failedNotifications: [] });
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [converting, setConverting] = useState(false);
  const [conversionFeedback, setConversionFeedback] = useState<{ requestId: string; ok: boolean; message: string } | null>(null);
  const [clarification, setClarification] = useState({ requestId: '', message: '', sending: false, feedback: '' });
  const [convert, setConvert] = useState({ requestId: '', technicianLeadId: '', hourlyRate: '55', travelRate: '35', directContactApproved: false, recipientEmails: [] as string[] });
  const [schedule, setSchedule] = useState({ appointmentId: '', start: '', end: '', technicianId: '' });

  const load = async () => { setLoading(true); try { setData(await adminApi('dashboard')); } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not load requests.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const post = async (action: string, body: unknown): Promise<AdminActionResult> => { setNotice(''); try { const result = await adminApi(action, { method: 'POST', body: JSON.stringify(body) }); await load(); setNotice('Saved successfully.'); return { ok: true, data: result }; } catch (error) { const message = error instanceof Error ? error.message : 'Could not save.'; setNotice(message); return { ok: false, error: message }; } };

  if (loading) return <div className="grid min-h-64 place-items-center text-sm text-slate-400"><RefreshCw className="h-5 w-5 animate-spin" /></div>;
  const pendingUsers = data.users.filter((user: any) => user.status !== 'active');
  const openRequests = data.requests.filter((request: RequestRecord) => !['declined', 'converted'].includes(request.status) && !request.convertedJobId);
  const convertedRequests = data.requests.filter((request: RequestRecord) => request.status === 'converted' || request.convertedJobId);
  const organizationFor = (request: RequestRecord): Organization | undefined => data.organizations.find((organization: Organization) => organization.id === request.organizationId) || data.organizations.find((organization: Organization) => organization.name?.toLowerCase() === request.companyName?.toLowerCase());
  const recipientsFor = (request: RequestRecord) => {
    const organization = organizationFor(request);
    const people = (organization?.personnel || []).filter((person) => person.email);
    const requester = request.requesterEmail ? [{ name: request.requesterName || 'Requester', email: request.requesterEmail, role: 'requester' }] : [];
    const seen = new Set<string>();
    return [...requester, ...people].filter((person) => { const email = person.email.toLowerCase(); if (seen.has(email)) return false; seen.add(email); return true; });
  };
  const openConversion = (request: RequestRecord) => {
    const organization = organizationFor(request);
    setConvert({ requestId: request.id, technicianLeadId: '', hourlyRate: '55', travelRate: '35', directContactApproved: false, recipientEmails: uniqueEmails([request.requesterEmail || '', ...(organization?.billingRecipientEmails || [])]) });
    setConversionFeedback(null);
  };
  const toggleRecipient = (email: string) => setConvert((current) => ({ ...current, recipientEmails: current.recipientEmails.includes(email) ? current.recipientEmails.filter((value) => value !== email) : [...current.recipientEmails, email] }));
  const sendClarification = async () => {
    if (!clarification.message.trim()) { setClarification((current) => ({ ...current, feedback: 'Enter the clarification you need from the customer.' })); return; }
    setClarification((current) => ({ ...current, sending: true, feedback: '' }));
    const result = await post('request-status', { requestId: clarification.requestId, status: 'clarification_needed', reviewNote: clarification.message.trim() });
    setClarification((current) => ({ ...current, sending: false, feedback: result.ok ? 'Clarification request sent to the customer.' : ('error' in result ? result.error : 'Could not send clarification.') }));
  };
  const createWorkOrder = async () => {
    if (!convert.recipientEmails.length) {
      setConversionFeedback({ requestId: convert.requestId, ok: false, message: 'Select at least one job email recipient before creating the work order.' });
      return;
    }
    setConverting(true);
    setConversionFeedback(null);
    const result = await post('convert', { ...convert, assignedTechIds: convert.technicianLeadId ? [convert.technicianLeadId] : ['ALL'] });
    setConverting(false);
    setConversionFeedback({ requestId: convert.requestId, ok: result.ok, message: result.ok ? `Work order ${result.data?.workOrderNumber || ''} created successfully.`.replace('  ', ' ') : ('error' in result ? result.error : 'Could not create the work order.') });
  };

  return <div className="space-y-6">
    {notice && <div className="rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">{notice}</div>}
    {data.failedNotifications.length > 0 && <div className="flex gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200"><AlertTriangle className="h-5 w-5 shrink-0" /><div><strong>{data.failedNotifications.length} notification deliveries need attention.</strong><p className="mt-1 text-xs text-red-200/70">Review provider configuration or delivery errors before relying on alerts.</p></div></div>}
    <div className="grid gap-4 md:grid-cols-4">{[['New requests', data.requests.filter((request: RequestRecord) => request.status === 'requested').length], ['Needs clarification', data.requests.filter((request: RequestRecord) => request.status === 'clarification_needed').length], ['Pending users', pendingUsers.length], ['Appointments', data.appointments.length]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-white">{value}</p></div>)}</div>

    <section><h3 className="mb-3 text-sm font-bold text-white">Active job requests</h3>{openRequests.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-xs text-slate-500">No customer requests are waiting for review.</p>}<div className="space-y-3">{openRequests.map((request: RequestRecord) => {
      const recipients = recipientsFor(request);
      return <article key={request.id} className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><span className="font-mono text-[10px] text-green-400">{request.requestNumber}</span>{request.urgent && <span className="rounded bg-red-500/15 px-2 py-0.5 text-[9px] font-bold text-red-300">URGENT</span>}</div><h4 className="mt-1 text-lg font-bold text-white">{request.siteName}</h4><p className="text-xs text-slate-400">{request.companyName} · {request.clientReference || 'No customer reference'} · {request.requesterName}</p><p className="mt-1 text-[10px] text-slate-500">📍 {request.address || 'Address pending'}{request.siteContact ? ` · Contact: ${request.siteContact}` : ''}</p><p className="mt-2 text-xs text-slate-300">{request.scopeSummary}</p><p className="mt-2 text-[10px] text-slate-500">Preferred: {request.requestedWindows?.[0]?.date} {request.requestedWindows?.[0]?.start}–{request.requestedWindows?.[0]?.end}</p>{(request.accessInstructions || request.safetyRequirements || request.deliverables || request.attachments?.length) && <details className="mt-3 rounded border border-slate-800 bg-slate-900/60 p-3 text-[10px] text-slate-300"><summary className="cursor-pointer font-bold text-green-300">Work-order details{request.attachments?.length ? ` · ${request.attachments.length} document${request.attachments.length === 1 ? '' : 's'}` : ''}</summary>{request.deliverables && <p className="mt-2"><strong>Deliverables:</strong> {request.deliverables}</p>}{request.accessInstructions && <p className="mt-2"><strong>Site instructions:</strong> {request.accessInstructions}</p>}{request.safetyRequirements && <p className="mt-2"><strong>Safety:</strong> {request.safetyRequirements}</p>}</details>}</div><span className="rounded bg-white/5 px-3 py-1 text-xs capitalize text-amber-300">{request.status.replace(/_/g, ' ')}</span></div>
        <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => post('request-status', { requestId: request.id, status: 'reviewing' })} className="rounded border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300">Reviewing</button><button onClick={() => setClarification({ requestId: request.id, message: '', sending: false, feedback: '' })} className="rounded border border-amber-500/30 px-3 py-2 text-[10px] font-bold text-amber-300">Request clarification</button><button onClick={() => openConversion(request)} className="rounded bg-green-500 px-3 py-2 text-[10px] font-bold text-slate-950">Open work order setup</button><button onClick={() => { const note = window.prompt('Reason for declining'); if (note) void post('request-status', { requestId: request.id, status: 'declined', reviewNote: note }); }} className="rounded border border-red-500/30 px-3 py-2 text-[10px] font-bold text-red-300">Decline</button></div>
        {clarification.requestId === request.id && <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/5 p-4"><label className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Clarification needed from customer<textarea autoFocus rows={3} value={clarification.message} onChange={(event)=>setClarification((current)=>({...current,message:event.target.value,feedback:''}))} placeholder="Describe exactly what information or document is needed…" className="mt-2 w-full rounded border border-slate-700 bg-slate-900 p-3 text-xs font-normal normal-case text-white"/></label><div className="mt-2 flex gap-2"><button type="button" disabled={clarification.sending} onClick={()=>void sendClarification()} className="rounded bg-amber-500 px-3 py-2 text-[10px] font-bold text-slate-950 disabled:opacity-50">{clarification.sending ? 'Sending…' : 'Send clarification request'}</button><button type="button" onClick={()=>setClarification({requestId:'',message:'',sending:false,feedback:''})} className="rounded border border-slate-700 px-3 py-2 text-[10px] font-bold text-slate-300">Cancel</button></div>{clarification.feedback && <p role="status" className="mt-2 text-xs text-amber-200">{clarification.feedback}</p>}</div>}
        {convert.requestId === request.id && <div className="mt-4 grid gap-2 rounded border border-green-500/20 bg-green-500/5 p-4 md:grid-cols-4">
          <select value={convert.technicianLeadId} onChange={(event) => setConvert((current) => ({ ...current, technicianLeadId: event.target.value }))} className="rounded bg-slate-900 p-2 text-xs text-white"><option value="">Choose technician</option>{contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}</option>)}</select>
          <input type="number" value={convert.hourlyRate} onChange={(event) => setConvert((current) => ({ ...current, hourlyRate: event.target.value }))} className="rounded bg-slate-900 p-2 text-xs text-white" placeholder="Hourly rate"/>
          <input type="number" value={convert.travelRate} onChange={(event) => setConvert((current) => ({ ...current, travelRate: event.target.value }))} className="rounded bg-slate-900 p-2 text-xs text-white" placeholder="Travel rate"/>
          <button type="button" disabled={converting} onClick={() => void createWorkOrder()} className="rounded bg-green-500 p-2 text-xs font-bold text-slate-950 disabled:opacity-50">{converting ? 'Creating work order…' : 'Create work order'}</button>
          <details className="md:col-span-4 rounded border border-slate-800 bg-slate-950 text-xs text-white" open><summary className="cursor-pointer px-3 py-2 font-semibold">Job email recipients ({convert.recipientEmails.length} selected)</summary><div className="grid gap-2 border-t border-slate-800 p-3 md:grid-cols-2">{recipients.map((person) => { const email = person.email.toLowerCase(); return <label key={email} className="flex items-start gap-2 rounded bg-slate-900 p-2"><input type="checkbox" checked={convert.recipientEmails.includes(email)} onChange={() => toggleRecipient(email)} className="mt-0.5 accent-green-500"/><span><strong className="block text-slate-200">{person.name}</strong><span className="text-[10px] capitalize text-slate-500">{person.role.replace(/_/g, ' ')} · {email}</span></span></label>; })}</div></details>
          <p className="md:col-span-4 text-[10px] text-slate-500">The requester and company billing recipients are selected by default. Adjust this list for the salesperson or payroll contacts who belong on this job.</p>
          <label className="md:col-span-4 flex gap-2 text-xs text-slate-300"><input type="checkbox" checked={convert.directContactApproved} onChange={(event) => setConvert((current) => ({ ...current, directContactApproved: event.target.checked }))}/>Approve direct technician contact for this job</label>
          {conversionFeedback?.requestId === request.id && <div role="status" className={`md:col-span-4 rounded border p-3 text-xs ${conversionFeedback.ok ? 'border-green-500/30 bg-green-500/10 text-green-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`}>{conversionFeedback.message}</div>}
        </div>}
      </article>;
    })}</div>{convertedRequests.length > 0 && <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950"><summary className="cursor-pointer px-5 py-4 text-xs font-bold text-slate-400">Converted requests ({convertedRequests.length}) — read only</summary><div className="space-y-2 border-t border-slate-800 p-4">{convertedRequests.map((request: RequestRecord)=><div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-slate-900 p-3 opacity-60"><div><p className="font-mono text-[10px] text-green-400">{request.requestNumber}</p><p className="text-xs font-bold text-white">{request.siteName}</p></div><span className="rounded bg-green-500/10 px-3 py-1 text-[10px] font-bold text-green-300">Converted · locked</span></div>)}</div></details>}</section>

    <section><h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-white"><CalendarClock className="h-4 w-4 text-green-400"/>Scheduling</h3><p className="mb-3 text-[10px] text-slate-500">{data.appointments.filter((appointment:any)=>appointment.status==='requested').length} converted work order(s) are awaiting schedule confirmation.</p><div className="grid gap-3 lg:grid-cols-2">{data.appointments.map((appointment: any) => <article key={appointment.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><p className="font-mono text-[10px] text-green-400">{appointment.workOrderNumber || `Appointment ${appointment.id.slice(-6)}`}</p><p className="mt-1 text-sm font-bold text-white">{appointment.jobName || 'Work order'}</p><p className="mt-1 text-[10px] text-slate-500">{appointment.jobAddress || 'Address pending'}{appointment.clientReference ? ` · ${appointment.clientReference}` : ''}</p><p className="mt-2 text-[10px] capitalize text-amber-300">{appointment.status}{appointment.requestedWindows?.[0]?.date ? ` · requested ${appointment.requestedWindows[0].date}` : ''}</p>{appointment.confirmedStart && <p className="mt-2 text-xs text-green-300">Confirmed: {new Date(appointment.confirmedStart).toLocaleString()}</p>}<button onClick={() => setSchedule((current) => ({ ...current, appointmentId: appointment.id, technicianId: appointment.technicianId || '' }))} className="mt-3 text-[10px] font-bold text-green-400">{appointment.status === 'confirmed' ? 'Change schedule' : 'Confirm schedule'}</button>{schedule.appointmentId === appointment.id && <div className="mt-3 grid grid-cols-2 gap-2"><input type="datetime-local" value={schedule.start} onChange={(event) => setSchedule((current) => ({ ...current, start: event.target.value }))} className="rounded bg-slate-900 p-2 text-[10px] text-white"/><input type="datetime-local" value={schedule.end} onChange={(event) => setSchedule((current) => ({ ...current, end: event.target.value }))} className="rounded bg-slate-900 p-2 text-[10px] text-white"/><select value={schedule.technicianId} onChange={(event) => setSchedule((current) => ({ ...current, technicianId: event.target.value }))} className="rounded bg-slate-900 p-2 text-[10px] text-white"><option value="">Technician</option>{contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}</option>)}</select><button onClick={() => post('schedule', { appointmentId: appointment.id, start: new Date(schedule.start).toISOString(), end: new Date(schedule.end).toISOString(), technicianId: schedule.technicianId })} className="rounded bg-amber-500 p-2 text-[10px] font-bold text-slate-950">Confirm</button></div>}</article>)}</div></section>

    <div className="grid gap-6 lg:grid-cols-2"><section className="rounded-xl border border-slate-800 bg-slate-950 p-5"><h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-white"><UserPlus className="h-4 w-4 text-green-400"/>Pending memberships</h3>{pendingUsers.length === 0 ? <p className="text-xs text-slate-500">No pending memberships.</p> : pendingUsers.map((user: any) => <div key={user.id} className="mb-3 flex items-center justify-between gap-3 rounded bg-slate-900 p-3"><div><p className="text-xs font-bold text-white">{user.displayName}</p><p className="text-[10px] text-slate-500">{user.email} · email {user.emailVerified ? '✓' : '—'} · phone {user.phoneVerified ? '✓' : '—'}</p></div><button disabled={!user.emailVerified || !user.phoneVerified} onClick={() => post('approve-member', { uid: user.id, roles: user.requestedRoles })} className="rounded bg-green-500 px-3 py-1.5 text-[10px] font-bold text-slate-950 disabled:opacity-30">Approve</button></div>)}</section><ClientCompanyEditor organizations={data.organizations} post={post}/></div>
    <ClientPortalConfiguration data={data} contractors={contractors} post={post} />
  </div>;
}
