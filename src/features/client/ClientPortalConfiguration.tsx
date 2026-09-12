import { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase';
import type { AdminActionResult } from './ClientRequestsAdmin';
import { CrmButton, CrmCard, CrmInput } from '../crm/ui';

type Contractor = Record<string, any> & { id: string; name: string; email: string };

export function ClientPortalConfiguration({ data, contractors, post }: { data: any; contractors: Contractor[]; post: (action: string, body: unknown) => Promise<AdminActionResult> }) {
  const [contractorId, setContractorId] = useState(contractors[0]?.id || '');
  const selected = contractors.find((item) => item.id === contractorId);
  const [profile, setProfile] = useState({ publicDisplayName: '', specialty: '', profilePhotoUrl: '', showPhotoToClients: false, allowDirectClientContact: false, businessPhone: '', businessEmail: '', contactHours: '' });
  useEffect(() => { if (selected) setProfile({ publicDisplayName: selected.publicDisplayName || selected.name || '', specialty: selected.specialty || '', profilePhotoUrl: selected.profilePhotoUrl || '', showPhotoToClients: selected.showPhotoToClients === true, allowDirectClientContact: selected.allowDirectClientContact === true, businessPhone: selected.businessPhone || '', businessEmail: selected.businessEmail || '', contactHours: selected.contactHours || '' }); }, [selected?.id]);

  const connectCalendar = async () => {
    const token = await auth.currentUser?.getIdToken();
    const response = await fetch('/api/auth/google-calendar?action=start', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not start Calendar authorization.');
    window.location.assign(result.url);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <CrmCard>
        <h3 className="text-sm font-semibold text-crm-ink">Portal rollout & integrations</h3>
        <div className="mt-4 space-y-2">
          <label className="flex items-center justify-between rounded-lg border border-crm-hairline p-3 text-xs text-crm-body">
            <span>Accept public booking requests</span>
            <input type="checkbox" checked={data.settings?.enabled !== false} onChange={(event) => void post('settings', { ...data.settings, enabled: event.target.checked })} className="accent-crm-primary" />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-crm-hairline p-3 text-xs text-crm-body">
            <span>Pilot organizations only</span>
            <input type="checkbox" checked={data.settings?.pilotOnly === true} onChange={(event) => void post('settings', { ...data.settings, pilotOnly: event.target.checked })} className="accent-crm-primary" />
          </label>
          <CrmButton variant="secondary" onClick={() => void connectCalendar()} className="w-full">Connect / refresh Google Calendar</CrmButton>
        </div>
        <h4 className="mt-6 text-xs font-semibold text-crm-body">Pending scope changes</h4>
        {(data.scopeChanges || []).length === 0 ? (
          <p className="mt-2 text-xs text-crm-muted">No pending scope changes.</p>
        ) : (
          (data.scopeChanges || []).map((change: any) => (
            <div key={change.id} className="mt-2 rounded-lg border border-crm-hairline p-3">
              <p className="text-xs text-crm-ink">{change.revisedScope}</p>
              <p className="mt-1 text-[10px] text-crm-muted">Reason: {change.reason}</p>
              <div className="mt-2 flex gap-2">
                <CrmButton onClick={() => void post('scope-change', { scopeVersionId: change.id, approve: true })} className="h-8 px-2.5 text-[11px]">Approve</CrmButton>
                <button type="button" onClick={() => void post('scope-change', { scopeVersionId: change.id, approve: false })} className="rounded-lg border border-crm-error/30 px-2.5 py-1 text-[11px] font-bold text-crm-error">Decline</button>
              </div>
            </div>
          ))
        )}
      </CrmCard>
      <CrmCard>
        <h3 className="text-sm font-semibold text-crm-ink">Client-safe technician profile</h3>
        <select value={contractorId} onChange={(e) => setContractorId(e.target.value)} className="mt-4 h-10 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs text-crm-ink">
          {contractors.map((contractor) => <option key={contractor.id} value={contractor.id}>{contractor.name}</option>)}
        </select>
        {selected && (
          <div className="mt-3 grid gap-2">
            <CrmInput value={profile.publicDisplayName} onChange={(e) => setProfile((v) => ({ ...v, publicDisplayName: e.target.value }))} placeholder="Public name (Jordan M.)" />
            <CrmInput value={profile.specialty} onChange={(e) => setProfile((v) => ({ ...v, specialty: e.target.value }))} placeholder="Role / specialty" />
            <CrmInput value={profile.profilePhotoUrl} onChange={(e) => setProfile((v) => ({ ...v, profilePhotoUrl: e.target.value }))} placeholder="Approved profile photo URL" />
            <CrmInput value={profile.businessPhone} onChange={(e) => setProfile((v) => ({ ...v, businessPhone: e.target.value }))} placeholder="Business phone" />
            <CrmInput value={profile.businessEmail} onChange={(e) => setProfile((v) => ({ ...v, businessEmail: e.target.value }))} placeholder="Business email" />
            <CrmInput value={profile.contactHours} onChange={(e) => setProfile((v) => ({ ...v, contactHours: e.target.value }))} placeholder="Contact hours" />
            <label className="flex gap-2 text-xs text-crm-body"><input type="checkbox" checked={profile.showPhotoToClients} onChange={(e) => setProfile((v) => ({ ...v, showPhotoToClients: e.target.checked }))} />Show approved photo</label>
            <label className="flex gap-2 text-xs text-crm-body"><input type="checkbox" checked={profile.allowDirectClientContact} onChange={(e) => setProfile((v) => ({ ...v, allowDirectClientContact: e.target.checked }))} />Allow approved direct client contact</label>
            <CrmButton onClick={() => void post('technician-public-profile', { contractorId, ...profile })}>Save public profile</CrmButton>
          </div>
        )}
      </CrmCard>
    </div>
  );
}
