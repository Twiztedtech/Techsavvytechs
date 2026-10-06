import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

// The public "delete my account" page: the link Google Play and the App Store
// ask for. Technicians can delete themselves in the app; anyone else (customers,
// or anyone who cannot sign in) can send a request that reaches the office.
export default function DeleteAccount() {
  const [form, setForm] = useState({ name: '', email: '', kind: 'Technician', details: '', company: '' });
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: 'account-deletion',
          name: form.name,
          email: form.email,
          company: form.company,
          message: `Please delete my TechSavvy account and personal data.\nAccount type: ${form.kind}\n${form.details ? `Details: ${form.details}` : ''}`.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Your request could not be sent. Please email privacy@techsavvytechs.com.');
      setStatus('sent');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Your request could not be sent.');
      setStatus('error');
    }
  }

  const input = 'mt-1.5 min-h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none focus:border-safety-orange';
  return (
    <div className="relative z-10 mx-auto max-w-3xl space-y-8 px-4 py-20">
      <div className="space-y-2 border-l-4 border-safety-orange pl-4">
        <h1 className="text-3xl font-black tracking-tight text-white">DELETE YOUR ACCOUNT</h1>
        <p className="text-sm text-slate-400">TechSavvy LLC · technician app and client portal</p>
      </div>

      <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm leading-relaxed text-slate-300 md:p-8">
        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">Technicians: delete it yourself</h2>
          <ol className="list-decimal space-y-1 pl-5 text-slate-400">
            <li>Open the TechSavvy app (or <Link to="/contractor/dashboard" className="text-safety-orange underline">sign in on the website</Link>).</li>
            <li>Go to <strong className="text-slate-200">My Profile</strong> and scroll to <strong className="text-slate-200">Delete my account</strong>.</li>
            <li>Confirm it is you, type DELETE, and confirm. It takes effect immediately.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-bold text-white">What happens to your data</h2>
          <p className="font-bold text-slate-200">We delete:</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-400">
            <li>Your login and sign-in methods.</li>
            <li>Your name, email, phone number, profile photo, saved signature, skills, tools and certifications.</li>
            <li>Your notification and text-message settings.</li>
            <li>The GPS location stamps saved with your clock-ins and clock-outs.</li>
          </ul>
          <p className="pt-1 font-bold text-slate-200">We keep, because the law requires it:</p>
          <ul className="list-disc space-y-1 pl-5 text-slate-400">
            <li>Pay history and your W-9, for tax and 1099 reporting. These are kept for 4 years, then removed. They are no longer connected to a login.</li>
            <li>Completed work records customers already received (signed work orders, invoices), which can still show your name.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-white">Customers, or can't sign in? Send a request</h2>
          <p className="text-slate-400">We confirm by email and complete deletion within 30 days. We may need to verify the request comes from you.</p>
          {status === 'sent' ? (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-200">Request received. We will email you to confirm.</p>
          ) : (
            <form onSubmit={submit} className="grid gap-4">
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Your name<input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={input} /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Email on the account<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className={input} /></label>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">I am a
                <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })} className={input}>
                  <option>Technician</option>
                  <option>Client portal user</option>
                  <option>Other</option>
                </select>
              </label>
              <label className="text-xs font-bold uppercase tracking-wide text-slate-400">Anything else we should know (optional)<textarea rows={3} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} className={input} /></label>
              {/* Honeypot: real people never see or fill this. */}
              <input tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} className="hidden" />
              {error && <p className="rounded-lg bg-red-500/10 p-3 text-red-300">{error}</p>}
              <button disabled={status === 'sending'} className="rounded-lg bg-safety-orange px-5 py-3 text-sm font-black text-black disabled:opacity-50">{status === 'sending' ? 'Sending…' : 'Request deletion'}</button>
            </form>
          )}
          <p className="text-xs text-slate-500">You can also email <span className="font-mono text-slate-300">privacy@techsavvytechs.com</span>. See our <Link to="/privacy" className="text-safety-orange underline">Privacy Policy</Link>.</p>
        </section>
      </div>
    </div>
  );
}
