import React, { useEffect, useState } from 'react';
import { auth } from '../../../lib/firebase';

async function portalApi(path: string, options: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not save the update.');
  return data;
}

export function ContractorProgressPanel({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState('in_progress');
  const [message, setMessage] = useState('');
  const [clientVisible, setClientVisible] = useState(true);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const load = async () => { try { setAppointments((await portalApi(`/api/portal/job-events?action=appointments&jobId=${encodeURIComponent(jobId)}`)).appointments || []); } catch { setAppointments([]); } };
  useEffect(() => { void load(); }, [jobId]);
  return <section className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-xs"><div className="flex items-center justify-between gap-3"><div><p className="font-bold uppercase tracking-wider text-green-400">Client progress update</p><p className="mt-1 text-slate-500">Choose whether the note is safe for the client timeline.</p></div><select value={status} onChange={(e)=>setStatus(e.target.value)} className="rounded bg-slate-950 px-2 py-1.5 text-xs text-white"><option value="accepted">Assignment accepted</option><option value="en_route">En route</option><option value="on_site">On site</option><option value="in_progress">Work in progress</option><option value="blocked">Blocked</option><option value="completed">Completed</option><option value="missed">Missed visit</option></select></div><textarea rows={2} value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Progress note or reason…" className="mt-3 w-full rounded border border-slate-800 bg-slate-950 p-2 text-xs text-white"/><div className="mt-2 flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-2 text-slate-300"><input type="checkbox" checked={clientVisible} onChange={(e)=>setClientVisible(e.target.checked)} className="accent-green-500"/>Visible to client</label><button type="button" onClick={async()=>{try{await portalApi('/api/portal/job-events?action=progress',{method:'POST',body:JSON.stringify({jobId,status,message,clientVisible})});setMessage('');setNotice('Update saved.')}catch(error){setNotice(error instanceof Error?error.message:'Could not save.')}}} className="rounded bg-green-500 px-3 py-1.5 font-bold text-slate-950">Post update</button></div>{appointments.filter((appointment)=>appointment.rescheduleProposal?.status==='proposed').map((appointment)=><div key={appointment.id} className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 p-3"><p className="font-bold text-amber-300">Client proposed {new Date(appointment.rescheduleProposal.start).toLocaleString()}–{new Date(appointment.rescheduleProposal.end).toLocaleTimeString()}</p><div className="mt-2 flex gap-2"><button type="button" onClick={async()=>{await portalApi('/api/portal/job-events?action=reschedule-response',{method:'POST',body:JSON.stringify({appointmentId:appointment.id,accept:true})});await load();}} className="rounded bg-amber-500 px-3 py-1 font-bold text-slate-950">Accept</button><button type="button" onClick={async()=>{await portalApi('/api/portal/job-events?action=reschedule-response',{method:'POST',body:JSON.stringify({appointmentId:appointment.id,accept:false})});await load();}} className="rounded border border-slate-600 px-3 py-1 font-bold text-slate-300">Decline</button></div></div>)}{notice&&<p className="mt-2 text-[10px] text-green-300">{notice}</p>}</section>;
}
