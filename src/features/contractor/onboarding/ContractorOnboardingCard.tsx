import { useState } from 'react';
import { auth, storage } from '../../../lib/firebase';
import { ref, uploadBytes } from 'firebase/storage';

export type OnboardingStatus = 'not_started' | 'submitted' | 'approved' | 'needs_update';

export interface OnboardingState {
  status: OnboardingStatus;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string;
  agreementAcceptedAt?: string | null;
  hasW9?: boolean;
  w9FileName?: string | null;
}

export function ContractorOnboardingCard({ onboarding, onUpdated }: { onboarding: OnboardingState | null; onUpdated: (value: OnboardingState) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const current = onboarding || { status: 'not_started' as const };
  const needsAction = current.status === 'not_started' || current.status === 'needs_update';

  const submit = async () => {
    if (!file) return alert('Choose your completed W-9 PDF first.');
    if (!accepted) return alert('Please accept the contractor portal terms before submitting.');
    if (file.type !== 'application/pdf' || file.size > 25 * 1024 * 1024) return alert('Upload a PDF smaller than 25 MB.');
    const user = auth.currentUser;
    if (!user) return;
    setIsSubmitting(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `contractor-onboarding/${user.uid}/w9/${Date.now()}-${safeName}`;
      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType: 'application/pdf' });
      const token = await user.getIdToken();
      const response = await fetch('/api/portal/onboarding', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreementAccepted: true, w9: { storagePath, fileName: file.name } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit your onboarding.');
      onUpdated(data.onboarding);
      setFile(null);
      setAccepted(false);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not submit your onboarding.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const labels: Record<OnboardingStatus, { title: string; detail: string; color: string }> = {
    not_started: { title: 'W-9 onboarding required', detail: 'Upload your completed W-9 and accept the portal terms before your first payment review.', color: 'amber' },
    submitted: { title: 'W-9 submitted', detail: 'Your W-9 and acknowledgement are with TechSavvy for review.', color: 'blue' },
    approved: { title: 'Onboarding approved', detail: 'Your W-9 and portal acknowledgement are on file.', color: 'green' },
    needs_update: { title: 'W-9 update requested', detail: current.reviewNote || 'Please upload an updated W-9 and submit again.', color: 'amber' },
  };
  const label = labels[current.status];
  const border = label.color === 'green' ? 'border-green-500/30 bg-green-500/5' : label.color === 'blue' ? 'border-sky-500/30 bg-sky-500/5' : 'border-amber-500/30 bg-amber-500/5';

  return <section className={`rounded-2xl border p-5 ${border}`} aria-label="Contractor onboarding">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-tech-green">Contractor onboarding</p><h2 className="mt-1 text-lg font-black text-white">{label.title}</h2><p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-300">{label.detail}</p></div><span className="rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-200">{current.status.replace('_', ' ')}</span></div>
    {needsAction ? <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]"><div className="space-y-3"><label className="block text-xs font-semibold text-slate-200">Completed W-9 (PDF, up to 25 MB)<input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-slate-300 file:mr-3 file:rounded file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-slate-700" /></label><label className="flex items-start gap-2 text-xs leading-relaxed text-slate-300"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />I have reviewed and accept the <a className="text-tech-green underline" href="/terms" target="_blank" rel="noreferrer">Contractor Portal Terms</a>.</label></div><button type="button" onClick={submit} disabled={isSubmitting} className="self-end rounded-lg bg-green-500 px-4 py-3 text-xs font-black text-slate-950 transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Submitting…' : 'Submit W-9'}</button></div> : <div className="mt-4 text-xs text-slate-300">{current.w9FileName ? <>Document on file: <span className="font-semibold text-white">{current.w9FileName}</span>.</> : null} {current.agreementAcceptedAt ? 'Terms acknowledgement recorded.' : null}</div>}
  </section>;
}
