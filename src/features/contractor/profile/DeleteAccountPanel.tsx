import { useState } from 'react';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../../lib/firebase';
import { signInWithGoogle } from '../../../lib/googleSignIn';

// In-app account deletion (required by Google Play / Apple). The server does the
// real work; this only collects a fresh sign-in and an explicit confirmation.
export function DeleteAccountPanel() {
  const [open, setOpen] = useState(false);
  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const providers = (auth.currentUser?.providerData || []).map((provider) => provider.providerId);
  const hasPassword = providers.includes('password');
  const hasGoogle = providers.includes('google.com');

  async function confirmIdentity(method: 'password' | 'google') {
    setBusy(true);
    setError('');
    try {
      if (method === 'password') {
        const email = auth.currentUser?.email;
        if (!email) throw new Error('This account has no email to confirm with.');
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithGoogle(auth);
      }
      setPassword('');
      setVerified(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replace('Firebase: ', '') : 'Could not confirm it is you.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError('');
    try {
      const token = await auth.currentUser?.getIdToken(true);
      const response = await fetch('/api/portal/time-clock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete_account', confirm: 'DELETE' }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.reauthRequired) setVerified(false);
      if (!response.ok) throw new Error(data.error || 'Your account could not be deleted.');
      // Nothing of theirs should be left on this device.
      try {
        Object.keys(localStorage).filter((key) => /^(survey-draft:|techsavvy-)/.test(key)).forEach((key) => localStorage.removeItem(key));
        indexedDB.deleteDatabase('techsavvy-survey-offline');
      } catch { /* storage unavailable */ }
      await signOut(auth).catch(() => undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your account could not be deleted.');
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-red-500/30 bg-red-500/5 p-5">
      <h3 className="text-sm font-black uppercase tracking-wide text-red-300">Delete my account</h3>
      {!open ? (
        <>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">Permanently remove your login and personal details from TechSavvy.</p>
          <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-red-500/40 px-4 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10">Delete my account…</button>
        </>
      ) : (
        <div className="mt-3 space-y-4 text-xs leading-relaxed text-slate-300">
          <div>
            <p className="font-bold text-slate-100">This cannot be undone. Deleting your account will:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-400">
              <li>Remove your login. You will be signed out everywhere.</li>
              <li>Erase your name, email, phone number, photo, signature, skills and notification settings.</li>
              <li>Erase the GPS location stamps saved with your clock-ins and clock-outs.</li>
              <li>Take you off any open work orders.</li>
            </ul>
          </div>
          <div>
            <p className="font-bold text-slate-100">What we have to keep:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-slate-400">
              <li>Your pay history and your W-9, for tax and 1099 records. We keep these for 4 years, then remove them.</li>
              <li>Work already completed: your name can remain on signed work orders and invoices that customers already received.</li>
            </ul>
          </div>
          {!verified ? (
            <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
              <p className="font-bold text-slate-100">First, confirm it is you.</p>
              {hasPassword && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" autoComplete="current-password" className="min-h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-white outline-none focus:border-red-400" />
                  <button type="button" disabled={busy || !password} onClick={() => void confirmIdentity('password')} className="rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{busy ? 'Checking…' : 'Confirm'}</button>
                </div>
              )}
              {hasGoogle && <button type="button" disabled={busy} onClick={() => void confirmIdentity('google')} className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-bold text-slate-100 disabled:opacity-40">Confirm with Google</button>}
              {!hasPassword && !hasGoogle && <p className="text-slate-400">Sign out and sign in again, then come back here.</p>}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border border-red-500/30 bg-slate-950 p-4">
              <label className="block font-bold text-slate-100">Type DELETE to confirm
                <input value={confirmText} onChange={(event) => setConfirmText(event.target.value)} autoCapitalize="characters" className="mt-2 block min-h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm font-normal text-white outline-none focus:border-red-400" />
              </label>
              <button type="button" disabled={busy || confirmText !== 'DELETE'} onClick={() => void deleteAccount()} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{busy ? 'Deleting…' : 'Permanently delete my account'}</button>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-500/10 p-3 text-red-300">{error}</p>}
          <button type="button" onClick={() => { setOpen(false); setVerified(false); setConfirmText(''); setError(''); }} className="text-xs font-bold text-slate-400 hover:text-white">Keep my account</button>
        </div>
      )}
    </section>
  );
}
