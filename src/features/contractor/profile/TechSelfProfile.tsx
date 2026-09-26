import { useState } from 'react';
import { auth } from '../../../lib/firebase';
import type { Certification, SelfProfile } from '../types';
import { resizeProfilePhoto } from '../../admin/techPhoto';

async function postTimeClock(action: string, body: Record<string, unknown> = {}) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch('/api/portal/time-clock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

const employmentTypeLabels: Record<string, string> = {
  '1099_contractor': '1099 Contractor',
  w2_employee: 'W-2 Employee',
};

function certStatus(expiryDate: string): { label: string; className: string } {
  if (!expiryDate) return { label: 'No expiry set', className: 'bg-slate-800 text-slate-400 border-slate-700' };
  const days = (new Date(expiryDate).getTime() - Date.now()) / 86400000;
  if (days < 0) return { label: 'Expired', className: 'bg-red-500/10 text-red-400 border-red-500/20' };
  if (days <= 30) return { label: 'Expiring soon', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
  return { label: 'Valid', className: 'bg-green-500/10 text-green-400 border-green-500/20' };
}

function TagList({ tags, onAdd, onRemove, placeholder }: { tags: string[]; onAdd: (tag: string) => void; onRemove: (index: number) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200">
            {tag}
            <button type="button" onClick={() => onRemove(index)} className="text-slate-500 hover:text-red-400" aria-label={`Remove ${tag}`}>
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-slate-500">None added yet.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
        />
        <button type="button" onClick={add} className="rounded border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-amber-500 hover:text-amber-400">
          + Add
        </button>
      </div>
    </div>
  );
}

export function TechSelfProfile({ profile, onUpdated }: { profile: SelfProfile | null; onUpdated: (profile: SelfProfile) => void }) {
  const [skills, setSkills] = useState<string[]>(profile?.skills || []);
  const [tools, setTools] = useState<string[]>(profile?.tools || []);
  const [certifications, setCertifications] = useState<Certification[]>(profile?.certifications || []);
  const [newCertName, setNewCertName] = useState('');
  const [newCertExpiry, setNewCertExpiry] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string>(profile?.profilePhotoUrl || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  if (!profile) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
        Your profile isn't linked yet. Contact your administrator.
      </div>
    );
  }

  const addCertification = () => {
    const name = newCertName.trim();
    if (!name) return;
    setCertifications([...certifications, { id: `${Date.now()}`, name, expiryDate: newCertExpiry }]);
    setNewCertName('');
    setNewCertExpiry('');
  };

  const onPhotoChosen = async (file?: File) => {
    if (!file) return;
    try {
      setPhotoUrl(await resizeProfilePhoto(file));
      setNotice({ tone: 'success', text: 'Photo ready — press Save profile to keep it.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not use this photo.' });
    }
  };

  const save = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const data = await postTimeClock('update_self_profile', { skills, tools, certifications, profilePhotoUrl: photoUrl });
      onUpdated({ ...profile, ...data.selfProfile });
      setNotice({ tone: 'success', text: 'Profile saved.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save your profile.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-4">
            {photoUrl ? (
              <img src={photoUrl} alt={profile.name} className="h-20 w-20 rounded-full border border-slate-700 object-cover" />
            ) : (
              <span className="grid h-20 w-20 place-items-center rounded-full border border-slate-700 bg-slate-800 text-xl font-bold text-slate-300">
                {(profile.name || 'T').split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase()}
              </span>
            )}
            <div>
              <h3 className="text-lg font-bold text-slate-100">{profile.name}</h3>
              <p className="text-xs text-slate-400">{profile.email}</p>
              <div className="mt-2 flex gap-2">
                <label className="cursor-pointer rounded border border-slate-700 px-3 py-1.5 text-[11px] font-bold text-slate-300 hover:border-amber-500 hover:text-amber-400">
                  {photoUrl ? 'Change photo' : 'Add photo'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { void onPhotoChosen(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {photoUrl && (
                  <button type="button" onClick={() => setPhotoUrl('')} className="rounded border border-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-red-400">
                    Remove
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
            <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-violet-300">
              {employmentTypeLabels[profile.employmentType]}
            </span>
            {profile.specialty && (
              <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-1 text-slate-300">{profile.specialty}</span>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Your rate, employment type, and contact info are managed by your administrator. If anything here is wrong, reach out to them.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h3 className="text-sm font-bold text-slate-100">Skills</h3>
        <p className="mb-3 text-xs text-slate-400">Add the skills you bring to a job site.</p>
        <TagList tags={skills} onAdd={(tag) => setSkills([...skills, tag])} onRemove={(index) => setSkills(skills.filter((_, i) => i !== index))} placeholder="e.g. Fiber splicing, Low-voltage cabling" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h3 className="text-sm font-bold text-slate-100">Tools</h3>
        <p className="mb-3 text-xs text-slate-400">Equipment you own or regularly bring to a job.</p>
        <TagList tags={tools} onAdd={(tag) => setTools([...tools, tag])} onRemove={(index) => setTools(tools.filter((_, i) => i !== index))} placeholder="e.g. Fusion splicer, OTDR" />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h3 className="text-sm font-bold text-slate-100">Certifications</h3>
        <p className="mb-3 text-xs text-slate-400">Add any licenses or certifications, with their expiry date if they have one.</p>
        <div className="space-y-2">
          {certifications.map((cert, index) => {
            const status = certStatus(cert.expiryDate);
            return (
              <div key={cert.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div>
                  <p className="text-xs font-semibold text-slate-100">{cert.name}</p>
                  <p className="text-[11px] text-slate-500">{cert.expiryDate ? `Expires ${cert.expiryDate}` : 'No expiry date'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${status.className}`}>{status.label}</span>
                  <button type="button" aria-label={`Remove ${cert.name}`} onClick={() => setCertifications(certifications.filter((_, i) => i !== index))} className="text-red-400 hover:text-red-300">
                    ×
                  </button>
                </div>
              </div>
            );
          })}
          {certifications.length === 0 && <p className="text-xs text-slate-500">None added yet.</p>}
        </div>
        <div className="mt-3 grid grid-cols-[1fr_150px_auto] gap-2">
          <input
            value={newCertName}
            onChange={(e) => setNewCertName(e.target.value)}
            placeholder="Certification name"
            className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
          />
          <input
            type="date"
            value={newCertExpiry}
            onChange={(e) => setNewCertExpiry(e.target.value)}
            className="rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
          />
          <button type="button" onClick={addCertification} className="rounded border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:border-amber-500 hover:text-amber-400">
            + Add
          </button>
        </div>
      </div>

      {notice && <p className={`text-xs font-semibold ${notice.tone === 'success' ? 'text-green-400' : 'text-red-400'}`}>{notice.text}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-amber-500 px-5 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}
