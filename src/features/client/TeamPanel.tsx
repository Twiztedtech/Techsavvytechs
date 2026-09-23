import { useState } from 'react';
import type { ClientRole } from './types';

type Api = (path: string, options?: RequestInit) => Promise<any>;
type Member = {
  id: string;
  displayName?: string;
  email?: string;
  roles?: ClientRole[];
  requestedRoles?: ClientRole[];
  status?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  phoneVerificationDeferred?: boolean;
};

const ROLE_OPTIONS: [ClientRole, string][] = [
  ['billing', 'Billing'],
  ['dispatcher', 'Dispatcher'],
  ['sales', 'Sales'],
  ['site_contact', 'Site contact'],
  ['project_viewer', 'Viewer (own jobs only)'],
];
const roleLabel = (role?: string) => (role || 'project_viewer').replace(/_/g, ' ');
const button = 'rounded px-3 py-1.5 text-xs font-bold disabled:opacity-30';

export function TeamPanel({ members, selfId, api, onChanged, notify }: {
  members: Member[];
  selfId: string;
  api: Api;
  onChanged: () => Promise<void> | void;
  notify: (tone: 'error' | 'success', text: string) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, ClientRole>>({});
  const [busy, setBusy] = useState('');
  const roleFor = (member: Member) => chosen[member.id] || member.requestedRoles?.[0] || 'project_viewer';

  const run = async (member: Member, path: string, body: Record<string, unknown>, success: string) => {
    setBusy(member.id);
    try {
      await api(`/api/client?action=${path}`, { method: 'POST', body: JSON.stringify({ uid: member.id, ...body }) });
      notify('success', success);
      await onChanged();
    } catch (error) {
      notify('error', error instanceof Error ? error.message : 'That change could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const pending = members.filter((m) => (m.status || 'pending') === 'pending');
  const others = members.filter((m) => m.status === 'active' || m.status === 'suspended');

  const picker = (member: Member, value: ClientRole, onChange: (role: ClientRole) => void) => (
    <select aria-label={`Access level for ${member.displayName || member.email}`} value={value} onChange={(e) => onChange(e.target.value as ClientRole)} className="rounded border border-white/10 bg-black/30 p-1.5 text-xs text-white">
      {ROLE_OPTIONS.map(([role, label]) => <option key={role} value={role}>{label}</option>)}
    </select>
  );

  return (
    <section className="mt-8 glass-card p-6">
      <h2 className="text-sm font-bold text-white">Your team</h2>
      <p className="mt-1 text-xs text-slate-500">You manage who at your company can use the portal. Company Administrator access can only be granted by TechSavvy.</p>

      {pending.length > 0 && (
        <div className="mt-4">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Waiting for approval</h3>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {pending.map((member) => (
              <div key={member.id} className="rounded bg-white/5 p-3">
                <p className="text-sm font-bold text-white">{member.displayName}</p>
                <p className="text-xs text-slate-500">{member.email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {picker(member, roleFor(member) as ClientRole, (role) => setChosen((c) => ({ ...c, [member.id]: role })))}
                  <button
                    disabled={busy === member.id || !member.emailVerified || (!member.phoneVerified && !member.phoneVerificationDeferred)}
                    onClick={() => void run(member, 'approve-member', { roles: [roleFor(member)] }, `${member.displayName || member.email} approved.`)}
                    className={`${button} bg-tech-green text-brand-black`}
                  >Approve</button>
                  <button disabled={busy === member.id} onClick={() => void run(member, 'update-member', { change: 'decline' }, 'Request declined.')} className={`${button} border border-red-400/40 text-red-300`}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Team members</h3>
        {others.length === 0 ? (
          <p className="mt-2 text-xs text-slate-500">No other team members yet.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {others.map((member) => {
              const isAdmin = member.roles?.includes('company_admin');
              const isSelf = member.id === selfId;
              return (
                <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded bg-white/5 p-3">
                  <div>
                    <p className="text-sm font-bold text-white">{member.displayName}{isSelf && <span className="ml-2 text-[10px] text-slate-500">(you)</span>}</p>
                    <p className="text-xs text-slate-500">{member.email}{member.status === 'suspended' && <span className="ml-2 font-bold text-red-300">access paused</span>}</p>
                  </div>
                  {isAdmin ? (
                    <span className="rounded bg-tech-green/10 px-2 py-1 text-[10px] font-bold uppercase text-tech-green">Company administrator</span>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {picker(member, (member.roles?.[0] || 'project_viewer') as ClientRole, (role) => void run(member, 'update-member', { change: 'roles', roles: [role] }, `${member.displayName || member.email} is now: ${roleLabel(role)}.`))}
                      {member.status === 'suspended' ? (
                        <button disabled={busy === member.id} onClick={() => void run(member, 'update-member', { change: 'restore' }, 'Access restored.')} className={`${button} border border-tech-green/40 text-tech-green`}>Restore access</button>
                      ) : (
                        <button disabled={busy === member.id} onClick={() => void run(member, 'update-member', { change: 'suspend' }, 'Access paused.')} className={`${button} border border-red-400/40 text-red-300`}>Pause access</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
