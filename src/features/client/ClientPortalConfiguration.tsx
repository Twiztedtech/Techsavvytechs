import { useEffect, useState } from 'react';
import { auth } from '../../lib/firebase';
import type { AdminActionResult } from './ClientRequestsAdmin';
import { CrmButton, CrmCard, CrmInput } from '../crm/ui';

type Contractor = Record<string, any> & { id: string; name: string; email: string };
type TestRow = { to: string; ok: boolean; error: string };

export function ClientPortalConfiguration({ data, contractors, post }: { data: any; contractors: Contractor[]; post: (action: string, body: unknown) => Promise<AdminActionResult> }) {
  const [contractorId, setContractorId] = useState(contractors[0]?.id || '');
  const selected = contractors.find((item) => item.id === contractorId);
  const [profile, setProfile] = useState({ publicDisplayName: '', specialty: '', profilePhotoUrl: '', showPhotoToClients: false, allowDirectClientContact: false, businessPhone: '', businessEmail: '', contactHours: '' });
  useEffect(() => { if (selected) setProfile({ publicDisplayName: selected.publicDisplayName || selected.name || '', specialty: selected.specialty || '', profilePhotoUrl: selected.profilePhotoUrl || '', showPhotoToClients: selected.showPhotoToClients === true, allowDirectClientContact: selected.allowDirectClientContact === true, businessPhone: selected.businessPhone || '', businessEmail: selected.businessEmail || '', contactHours: selected.contactHours || '' }); }, [selected?.id]);
  const [alertEmails, setAlertEmails] = useState('');
  const [alertPhones, setAlertPhones] = useState('');
  const [savingAlerts, setSavingAlerts] = useState(false);
  useEffect(() => {
    setAlertEmails((data.settings?.alertEmails || []).join(', '));
    setAlertPhones((data.settings?.alertPhones || []).join(', '));
  }, [data.settings?.alertEmails, data.settings?.alertPhones]);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ emails: TestRow[]; phones: TestRow[] } | null>(null);
  const [testError, setTestError] = useState('');
  const sendTestAlert = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/client-portal?action=test-alert', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The test could not be sent.');
      setTestResult({ emails: result.emails || [], phones: result.phones || [] });
    } catch (error) {
      setTestError(error instanceof Error ? error.message : 'The test could not be sent.');
    } finally {
      setTesting(false);
    }
  };
  const saveAlertRecipients = async () => {
    setSavingAlerts(true);
    try {
      await post('settings', { ...data.settings, alertEmails, alertPhones });
    } finally {
      setSavingAlerts(false);
    }
  };

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
        <h4 className="mt-6 text-xs font-semibold text-crm-body">New request &amp; approval alerts</h4>
        <p className="mt-1 text-[11px] text-crm-muted">
          Who gets emailed/texted when a new job request or portal-access request comes in and needs a look.
        </p>
        <div className="mt-2 space-y-2">
          <label className="block text-[11px] text-crm-muted">
            Alert emails (comma separated)
            <CrmInput value={alertEmails} onChange={(e) => setAlertEmails(e.target.value)} placeholder="you@techsavvytechs.com, ops@techsavvytechs.com" />
          </label>
          <label className="block text-[11px] text-crm-muted">
            Alert phone numbers (comma separated)
            <CrmInput value={alertPhones} onChange={(e) => setAlertPhones(e.target.value)} placeholder="+17075550100" />
          </label>
          <CrmButton onClick={() => void saveAlertRecipients()} className="w-full" disabled={savingAlerts}>
            {savingAlerts ? 'Saving…' : 'Save alert recipients'}
          </CrmButton>
          <CrmButton variant="secondary" onClick={() => void sendTestAlert()} className="w-full" disabled={testing}>
            {testing ? 'Sending test…' : 'Send test alert to saved recipients'}
          </CrmButton>
          {testError && <p className="text-[11px] font-semibold text-crm-error">{testError}</p>}
          {testResult && (
            <ul className="space-y-1 text-[11px]">
              {[...testResult.emails.map((row) => ({ ...row, kind: 'Email' })), ...testResult.phones.map((row) => ({ ...row, kind: 'Text' }))].map((row) => (
                <li key={`${row.kind}-${row.to}`} className={row.ok ? 'text-crm-success' : 'text-crm-error'}>
                  {row.ok ? '✓' : '✗'} {row.kind} to {row.to}: {row.ok ? 'accepted by the provider (check your phone or inbox).' : row.error}
                </li>
              ))}
              {testResult.emails.length + testResult.phones.length === 0 && (
                <li className="text-crm-muted">No saved recipients yet. Save at least one email or phone first.</li>
              )}
            </ul>
          )}
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
