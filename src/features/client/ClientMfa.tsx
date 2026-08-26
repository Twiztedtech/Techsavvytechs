import { useState, type FormEvent } from 'react';
import { FirebaseError } from 'firebase/app';
import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from 'firebase/auth';
import { KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { auth } from '../../lib/firebase';

export function resolverFromMfaError(error: unknown) {
  if (!(error instanceof FirebaseError) || error.code !== 'auth/multi-factor-auth-required') return null;
  return getMultiFactorResolver(auth, error as MultiFactorError);
}

export function userHasMfa(user: User) {
  return multiFactor(user).enrolledFactors.some((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

export function MfaSignIn({ resolver, onComplete, onCancel }: { resolver: MultiFactorResolver; onComplete: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const factor = resolver.hints.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!factor) return setError('This account does not have a supported authenticator factor.');
    setBusy(true); setError('');
    try {
      const assertion = TotpMultiFactorGenerator.assertionForSignIn(factor.uid, code);
      await resolver.resolveSignIn(assertion);
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That authenticator code is invalid or expired.');
    } finally { setBusy(false); }
  };

  return <div className="min-h-screen grid place-items-center bg-slate-950 px-5 text-white"><form onSubmit={submit} className="glass-card w-full max-w-md border-t-4 border-tech-green p-8"><KeyRound className="mb-4 h-10 w-10 text-tech-green"/><h1 className="text-2xl font-bold">Authenticator code</h1><p className="mt-2 mb-6 text-sm text-slate-400">Enter the six-digit code from your authenticator app to finish signing in.</p><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,''))} className="mb-4 w-full rounded border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-white"/>{error&&<p className="mb-4 rounded bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}<button disabled={busy||code.length!==6} className="w-full bg-tech-green px-5 py-3 font-bold text-brand-black disabled:opacity-50">{busy?'Verifying…':'Verify and sign in'}</button><button type="button" onClick={onCancel} className="mt-3 w-full px-5 py-2 text-xs font-bold text-slate-400">Cancel</button></form></div>;
}

export function MfaEnrollment({ user, onComplete, onSignOut }: { user: User; onComplete: () => void; onSignOut: () => void }) {
  const [secret, setSecret] = useState<TotpSecret | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const begin = async () => {
    setBusy(true); setError('');
    try {
      const session = await multiFactor(user).getSession();
      setSecret(await TotpMultiFactorGenerator.generateSecret(session));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authenticator setup could not start.');
    } finally { setBusy(false); }
  };

  const finish = async (event: FormEvent) => {
    event.preventDefault();
    if (!secret) return;
    setBusy(true); setError('');
    try {
      const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, code);
      await multiFactor(user).enroll(assertion, 'Authenticator app');
      await user.getIdToken(true);
      onComplete();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That authenticator code is invalid or expired.');
    } finally { setBusy(false); }
  };

  return <div className="min-h-screen bg-slate-950 px-5 py-8 text-white"><header className="mx-auto mb-10 flex max-w-7xl items-center justify-between border-b border-white/10 pb-5"><span className="font-display text-lg font-bold tracking-wider">TECH<span className="text-tech-green">SAVVY</span></span><button onClick={onSignOut} className="flex items-center gap-2 text-xs font-bold text-slate-400"><LogOut className="h-4 w-4"/> Sign out</button></header><form onSubmit={finish} className="glass-card mx-auto max-w-xl border-t-4 border-tech-green p-8"><ShieldCheck className="mb-4 h-12 w-12 text-tech-green"/><h1 className="text-2xl font-bold">Secure your account</h1><p className="mt-2 text-sm text-slate-400">Multi-factor authentication is required before company access. Use Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</p>{!secret?<button type="button" disabled={busy} onClick={begin} className="mt-6 w-full bg-safety-orange px-5 py-3 font-bold text-brand-black disabled:opacity-50">{busy?'Preparing…':'Set up authenticator'}</button>:<><ol className="mt-6 list-decimal space-y-3 pl-5 text-sm text-slate-300"><li>In your authenticator app, choose to add an account using a setup key.</li><li>Account: <strong>{user.email}</strong></li><li>Key: <code className="mt-2 block break-all rounded bg-black/30 p-3 font-mono text-tech-green select-all">{secret.secretKey}</code></li><li>Enter the six-digit code generated by the app.</li></ol><input autoFocus required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,''))} className="mt-5 mb-4 w-full rounded border border-white/10 bg-white/5 px-4 py-3 text-center font-mono text-2xl tracking-[0.4em] text-white"/><button disabled={busy||code.length!==6} className="w-full bg-tech-green px-5 py-3 font-bold text-brand-black disabled:opacity-50">{busy?'Enrolling…':'Confirm and enable MFA'}</button></>}{error&&<p className="mt-4 rounded bg-red-500/10 p-3 text-xs text-red-200">{error}</p>}</form></div>;
}
