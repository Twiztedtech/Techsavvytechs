import { useState, type FormEvent } from 'react';
import { auth } from '../../../lib/firebase';
import type { NotificationProfile } from '../types';

interface NotificationPreferencesModalProps {
  isOpen: boolean;
  profile: NotificationProfile | null;
  onClose: () => void;
  onUpdated: (profile: NotificationProfile) => void;
}

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

export function NotificationPreferencesModal({ isOpen, profile, onClose, onUpdated }: NotificationPreferencesModalProps) {
  const [mobile, setMobile] = useState(profile?.mobile || '');
  const [emailEnabled, setEmailEnabled] = useState(profile?.notificationPreferences.email ?? true);
  const [smsEnabled, setSmsEnabled] = useState(profile?.notificationPreferences.sms ?? true);
  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const needsVerification = mobile.trim() && !profile?.mobileVerified && !profile?.mobileVerificationDeferred && !awaitingCode;

  const savePreferences = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const data = await postTimeClock('save_notification_preferences', { mobile: mobile.trim(), emailEnabled, smsEnabled });
      onUpdated({
        mobile: mobile.trim(),
        mobileVerified: mobile.trim() === profile?.mobile ? Boolean(profile?.mobileVerified) : false,
        mobileVerificationDeferred: mobile.trim() === profile?.mobile ? Boolean(profile?.mobileVerificationDeferred) : false,
        notificationPreferences: data.notificationPreferences,
      });
      if (mobile.trim() && mobile.trim() !== profile?.mobile) {
        await postTimeClock('send_mobile_code');
        setAwaitingCode(true);
        setNotice({ tone: 'success', text: 'Preferences saved. We texted a verification code to your new number.' });
      } else {
        setNotice({ tone: 'success', text: 'Preferences saved.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not save preferences.' });
    } finally {
      setSaving(false);
    }
  };

  const requestCode = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await postTimeClock('send_mobile_code');
      setAwaitingCode(true);
      setNotice({ tone: 'success', text: 'A verification code was texted to your number.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not send a code.' });
    } finally {
      setSaving(false);
    }
  };

  const submitCode = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await postTimeClock('verify_mobile_code', { code });
      setAwaitingCode(false);
      setCode('');
      onUpdated({
        mobile,
        mobileVerified: true,
        mobileVerificationDeferred: false,
        notificationPreferences: { email: emailEnabled, sms: smsEnabled },
      });
      setNotice({ tone: 'success', text: 'Mobile number verified. You will now receive text updates.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'That code did not match.' });
    } finally {
      setSaving(false);
    }
  };

  const skipVerification = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await postTimeClock('defer_mobile_verification');
      setAwaitingCode(false);
      onUpdated({
        mobile,
        mobileVerified: false,
        mobileVerificationDeferred: true,
        notificationPreferences: { email: emailEnabled, sms: smsEnabled },
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Could not update your preferences.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5"><span>🔔</span> Notification Preferences</h3>
            <p className="text-xs text-slate-400">Choose how TechSavvy notifies you about job assignments and completions.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer">✕</button>
        </div>

        {notice && (
          <div className={`rounded border p-3 text-xs ${notice.tone === 'success' ? 'border-green-500/30 bg-green-500/10 text-green-200' : 'border-red-500/30 bg-red-500/10 text-red-200'}`} role="status">
            {notice.text}
          </div>
        )}

        {awaitingCode ? (
          <form onSubmit={submitCode} className="space-y-4">
            <p className="text-xs text-slate-400">Enter the 6-digit code we texted to {mobile}.</p>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-sm tracking-[0.3em] text-center text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={() => void skipVerification()} disabled={saving} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50">Skip for now</button>
              <button type="button" onClick={() => void requestCode()} disabled={saving} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50">Resend code</button>
              <button type="submit" disabled={saving || code.length !== 6} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50">Verify</button>
            </div>
          </form>
        ) : (
          <form onSubmit={savePreferences} className="space-y-4">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">Mobile number</label>
              <input
                type="tel"
                placeholder="+1 555 555 5555"
                value={mobile}
                onChange={(event) => setMobile(event.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
              />
              <p className="mt-1 text-[10px] text-slate-500">
                {profile?.mobileVerified ? 'Verified.' : profile?.mobileVerificationDeferred ? 'Not verified — text notifications are off.' : 'Not verified yet.'}
              </p>
              {profile?.mobile && !profile.mobileVerified && !profile.mobileVerificationDeferred && !needsVerification && (
                <button type="button" onClick={() => void requestCode()} className="mt-1 text-[10px] font-bold text-amber-400 hover:text-amber-300">Send verification code</button>
              )}
            </div>
            <label className="flex items-center justify-between rounded bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300">
              <span>Email notifications</span>
              <input type="checkbox" checked={emailEnabled} onChange={(event) => setEmailEnabled(event.target.checked)} className="accent-amber-500" />
            </label>
            <label className="flex items-center justify-between rounded bg-slate-950 border border-slate-800 p-3 text-xs text-slate-300">
              <span>Text (SMS) notifications</span>
              <input type="checkbox" checked={smsEnabled} onChange={(event) => setSmsEnabled(event.target.checked)} className="accent-amber-500" />
            </label>
            <p className="text-[10px] text-slate-500">By verifying your number you consent to receive transactional texts about your job assignments (arrival, completion, and approval updates). Message and data rates may apply. Reply STOP at any time to opt out.</p>
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer">Close</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
