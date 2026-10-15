import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { Link, NavLink, useNavigate } from 'react-router';
import { Camera, Loader2, Search, X } from 'lucide-react';
import { auth } from '../../lib/firebase';
import { isNativeApp } from '../../lib/native';
import { uploadCommunityPhoto, type Photo } from './api';

// Shared pieces for the community and training pages (technician portal look: dark slate + amber).

export function useAuthUser() {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: auth.currentUser, ready: false });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, ready: true })), []);
  return state;
}

export const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-amber-400';
export const primaryButton = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40';
export const ghostButton = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-40';

export function SearchBox({ to, initial = '' }: { to: string; initial?: string }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const q = value.trim();
    navigate(q ? `${to}?q=${encodeURIComponent(q)}` : to);
  };
  return (
    <form onSubmit={submit} role="search" className="relative w-full sm:w-72">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Search posts and lessons" aria-label="Search" className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-amber-400" />
    </form>
  );
}

export function CommunityShell({ children, signedIn, searchTo, searchValue }: { children: ReactNode; signedIn: boolean; searchTo: string; searchValue?: string }) {
  const tab = ({ isActive }: { isActive: boolean }) => `border-b-2 pb-2 text-sm font-bold transition ${isActive ? 'border-amber-500 text-amber-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`;
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 pt-3">
          <Link to={signedIn ? '/contractor/dashboard' : '/'} className="flex items-center gap-3">
            <span className="rounded bg-amber-500 px-2.5 py-1 text-base font-black tracking-tighter text-slate-950">TST</span>
            <span className="leading-none"><span className="block text-sm font-bold text-slate-100">TECH SAVVY TECHS</span><span className="text-[10px] font-semibold uppercase tracking-wider text-amber-500">Community &amp; Training</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <SearchBox to={searchTo} initial={searchValue} />
            {signedIn ? <Link to="/contractor/dashboard" className={`${ghostButton} hidden sm:inline-flex`}>Portal</Link> : <Link to="/auth" className={primaryButton}>Sign in</Link>}
          </div>
        </div>
        <nav className="mx-auto flex max-w-5xl gap-6 px-4 pt-3" aria-label="Community sections">
          {signedIn && !isNativeApp && <NavLink to="/community" className={tab}>Community</NavLink>}
          <NavLink to="/learn" className={tab}>Training</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <div className="grid place-items-center py-20 text-sm text-slate-400"><span className="flex items-center gap-2"><Loader2 className="animate-spin" size={16} />{label}</span></div>;
}

export function ErrorNote({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{message}</p> : null;
}

export function SignInPrompt({ title = 'Sign in to continue', body = 'The community is for TechSavvy technicians and staff.' }: { title?: string; body?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
      <h1 className="text-xl font-black text-white">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">{body}</p>
      <Link to="/auth" className={`${primaryButton} mt-5`}>Sign in</Link>
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'amber' | 'green' | 'red' }) {
  const tones = { slate: 'border-slate-700 bg-slate-800 text-slate-300', amber: 'border-amber-500/40 bg-amber-500/10 text-amber-300', green: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300', red: 'border-red-500/40 bg-red-500/10 text-red-300' };
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${tones[tone]}`}>{children}</span>;
}

/** Photo attach control: uploads straight from the phone and reports the finished photos upward. */
export function PhotoPicker({ photos, onChange, max = 6 }: { photos: Photo[]; onChange: (photos: Photo[]) => void; max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState('');
  async function pick(files: FileList | null) {
    const chosen = Array.from(files ?? []).slice(0, Math.max(0, max - photos.length));
    if (input.current) input.current.value = '';
    if (!chosen.length) return;
    setError('');
    setBusy((count) => count + chosen.length);
    const added: Photo[] = [];
    for (const file of chosen) {
      try { added.push(await uploadCommunityPhoto(file)); }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'A photo could not be uploaded.'); }
      finally { setBusy((count) => count - 1); }
    }
    if (added.length) onChange([...photos, ...added]);
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {photos.map((photo) => (
          <div key={photo.path || photo.url} className="relative">
            <img src={photo.url} alt={photo.name} className="h-16 w-16 rounded-lg border border-slate-700 object-cover" />
            <button type="button" onClick={() => onChange(photos.filter((item) => item !== photo))} aria-label={`Remove ${photo.name}`} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-slate-800 text-slate-300 ring-1 ring-slate-600 hover:text-white"><X size={12} /></button>
          </div>
        ))}
        {photos.length < max && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy > 0} className={ghostButton}>
            {busy > 0 ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}{busy > 0 ? 'Uploading…' : 'Add photo'}
          </button>
        )}
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void pick(event.target.files)} />
      </div>
      <ErrorNote message={error} />
    </div>
  );
}

export function PhotoStrip({ photos }: { photos?: Photo[] }) {
  if (!photos?.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {photos.map((photo) => (
        <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${photo.name}`}>
          <img src={photo.url} alt={photo.name} loading="lazy" className="h-24 w-24 rounded-lg border border-slate-700 object-cover transition hover:border-amber-500" />
        </a>
      ))}
    </div>
  );
}
