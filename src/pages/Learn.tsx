import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { BookOpen, CheckCircle2, Clock, Globe, Lock, Pencil, Plus, RotateCcw } from 'lucide-react';
import { applySeoMetadata } from '../components/Seo';
import { Markdown } from '../features/community/MarkdownView';
import { SuggestionReview } from '../features/community/SuggestionReview';
import { WikiEditor } from '../features/community/WikiEditor';
import { authReady, communityRequest, type WikiPage, type WikiSummary } from '../features/community/api';
import { Badge, CommunityShell, ErrorNote, Loading, ghostButton, inputClass, primaryButton, useAuthUser } from '../features/community/ui';

const message = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');

type ListState = { pages: WikiSummary[]; viewer: { role: string; canModerate: boolean; signedIn: boolean } };

function useWikiList(userKey: string | null, ready: boolean, version: number) {
  const [state, setState] = useState<ListState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setError('');
    authReady().then(() => communityRequest<ListState>('wiki-list')).then((result) => { if (!cancelled) setState(result); }).catch((reason) => { if (!cancelled) setError(message(reason)); });
    return () => { cancelled = true; };
  }, [userKey, ready, version]);
  return { state, error };
}

function LessonCard({ page, signedIn }: { page: WikiSummary; signedIn: boolean }) {
  return (
    <Link to={`/learn/${page.slug}`} className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-amber-500/50">
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {page.status === 'draft' && <Badge tone="red">Draft</Badge>}
          {page.visibility === 'public' && <Badge><Globe size={10} className="mr-1" />Public</Badge>}
          {signedIn && page.completed && !page.needsRetake && <Badge tone="green"><CheckCircle2 size={10} className="mr-1" />Completed</Badge>}
          {signedIn && page.needsRetake && <Badge tone="amber"><RotateCcw size={10} className="mr-1" />Updated since you read it</Badge>}
        </div>
        <h3 className="font-bold text-white group-hover:text-amber-300">{page.title}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-slate-400">{page.summary}</p>
        {page.estimatedMinutes > 0 && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><Clock size={12} />{page.estimatedMinutes} min</p>}
      </div>
    </Link>
  );
}

function SearchPanel({ q }: { q: string }) {
  const [pages, setPages] = useState<WikiSummary[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setPages(null);
    authReady().then(() => communityRequest<{ pages: WikiSummary[] }>('search', { query: { q } })).then((result) => setPages(result.pages)).catch((reason) => setError(message(reason)));
  }, [q]);
  return (
    <div className="space-y-4">
      <div><Link to="/learn" className="text-xs font-semibold text-amber-400 hover:underline">← All lessons</Link><h1 className="mt-1 text-2xl font-black text-white">Lessons matching “{q}”</h1></div>
      <ErrorNote message={error} />
      {!pages && !error && <Loading label="Searching…" />}
      {pages && !pages.length && <p className="text-sm text-slate-400">No lessons matched. Try a different word.</p>}
      <div className="grid gap-3">{pages?.map((page) => <Fragment key={page.slug}><LessonCard page={page} signedIn={false} /></Fragment>)}</div>
    </div>
  );
}

function Index({ list, onChanged }: { list: ListState; onChanged: () => void }) {
  const navigate = useNavigate();
  const { pages, viewer } = list;
  const [composing, setComposing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const tracks = useMemo(() => [...new Set(pages.map((page) => page.track))], [pages]);
  const published = pages.filter((page) => page.status === 'published');
  const done = published.filter((page) => page.completed && !page.needsRetake).length;
  const pct = published.length ? Math.round((done / published.length) * 100) : 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-400">Skills library</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">Training &amp; how-to guides</h1>
          <p className="mt-1 text-sm text-slate-400">Short lessons on the work we do. Mark each one complete as you go.</p>
        </div>
        {viewer.canModerate && (
          <div className="flex gap-2">
            <button onClick={() => setReviewing((value) => !value)} className={ghostButton}>Review suggestions</button>
            <button onClick={() => setComposing((value) => !value)} className={primaryButton}><Plus size={16} />New lesson</button>
          </div>
        )}
      </div>
      {!viewer.signedIn && (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-300">You are viewing the public lessons. <Link to="/auth" className="font-bold text-amber-400 hover:underline">Sign in</Link> as a TechSavvy technician for the full library and to track your progress.</p>
      )}
      {viewer.signedIn && published.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center justify-between text-sm"><span className="font-bold text-white">Your progress</span><span className="text-slate-400">{done} of {published.length} lessons</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Training progress"><div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {composing && <WikiEditor tracks={tracks} onCancel={() => setComposing(false)} onSaved={(slug) => { setComposing(false); onChanged(); navigate(`/learn/${slug}`); }} />}
      {reviewing && <SuggestionReview onChanged={onChanged} />}
      {!pages.length && <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">No lessons have been published yet.</div>}
      {tracks.map((track) => {
        const items = pages.filter((page) => page.track === track);
        const trackDone = items.filter((page) => page.status === 'published' && page.completed && !page.needsRetake).length;
        const trackTotal = items.filter((page) => page.status === 'published').length;
        return (
          <section key={track}>
            <div className="mb-3 flex items-baseline justify-between"><h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300"><BookOpen size={15} className="text-amber-500" />{track}</h2>{viewer.signedIn && trackTotal > 0 && <span className="text-xs text-slate-500">{trackDone}/{trackTotal}</span>}</div>
            <div className="grid gap-3 sm:grid-cols-2">{items.map((page) => <Fragment key={page.slug}><LessonCard page={page} signedIn={viewer.signedIn} /></Fragment>)}</div>
          </section>
        );
      })}
    </div>
  );
}

function Lesson({ slug, tracks, onChanged }: { slug: string; tracks: string[]; onChanged: () => void }) {
  const { user, ready } = useAuthUser();
  const [data, setData] = useState<{ page: WikiPage; canEdit: boolean; pendingSuggestions: number; signedIn: boolean } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [proposal, setProposal] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try { setData(await communityRequest('wiki-page', { query: { slug } })); setError(''); }
    catch (reason) { setError(message(reason)); }
  }, [slug]);
  useEffect(() => {
    if (!ready) return;
    setData(null); setEditing(false); setSuggesting(false); setSent(false);
    void authReady().then(load);
  }, [ready, user?.uid, load]);

  useEffect(() => {
    if (!data) return;
    const { page } = data;
    const description = (page.summary || page.body.replace(/[#*_`>\-\[\]()!|]/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 155);
    applySeoMetadata({ title: `${page.title} | TechSavvy Training`, description, url: `${window.location.origin}/learn/${page.slug}`, noIndex: page.visibility !== 'public' || page.status !== 'published' });
  }, [data]);

  async function complete() {
    setBusy(true); setError('');
    try { await communityRequest('training-complete', { body: { slug } }); await load(); onChanged(); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  async function sendSuggestion() {
    setBusy(true); setError('');
    try { await communityRequest('wiki-suggest', { body: { slug, body: proposal, note } }); setSent(true); setSuggesting(false); }
    catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }

  if (error && !data) return <div className="space-y-4"><Link to="/learn" className="text-xs font-semibold text-amber-400 hover:underline">← All lessons</Link>{error.includes('not found') && !user ? <p className="text-sm text-slate-300">This lesson may be for signed-in technicians. <Link to="/auth" className="font-bold text-amber-400 hover:underline">Sign in</Link> to open it.</p> : <ErrorNote message={error} />}</div>;
  if (!data) return <Loading />;
  const { page, canEdit, signedIn } = data;
  if (editing) return <WikiEditor page={page} tracks={tracks} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); onChanged(); }} />;

  return (
    <article className="space-y-5">
      <Link to="/learn" className="text-xs font-semibold text-amber-400 hover:underline">← All lessons</Link>
      <header>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone="amber">{page.track}</Badge>
          {page.status === 'draft' && <Badge tone="red">Draft: only leads can see this</Badge>}
          <Badge>{page.visibility === 'public' ? <><Globe size={10} className="mr-1" />Public</> : <><Lock size={10} className="mr-1" />Technicians only</>}</Badge>
          {page.estimatedMinutes > 0 && <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={12} />{page.estimatedMinutes} min</span>}
        </div>
        <h1 className="text-3xl font-black text-white">{page.title}</h1>
        <p className="mt-1 text-xs text-slate-500">Version {page.version}{page.updatedByName ? ` · updated by ${page.updatedByName}` : ''}</p>
      </header>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7"><Markdown source={page.body} /></div>
      <ErrorNote message={error} />
      {sent && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">Thanks. Your suggestion was sent to the technician leads for review.</p>}
      {page.status === 'published' && signedIn && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          {page.completed && !page.needsRetake ? <span className="flex items-center gap-2 text-sm font-bold text-emerald-300"><CheckCircle2 size={18} />You completed this lesson</span> : (
            <>
              {page.needsRetake && <span className="text-sm text-amber-300">This lesson was updated after you completed it.</span>}
              <button onClick={complete} disabled={busy} className={primaryButton}><CheckCircle2 size={16} />{page.needsRetake ? 'Mark read again' : 'Mark as completed'}</button>
            </>
          )}
          <div className="ml-auto flex gap-2">
            {canEdit && <button onClick={() => setEditing(true)} className={ghostButton}><Pencil size={13} />Edit lesson{data.pendingSuggestions ? ` · ${data.pendingSuggestions} suggestion${data.pendingSuggestions === 1 ? '' : 's'}` : ''}</button>}
            {!canEdit && !suggesting && <button onClick={() => { setProposal(page.body); setSuggesting(true); setSent(false); }} className={ghostButton}>Suggest an edit</button>}
          </div>
        </div>
      )}
      {page.status === 'draft' && canEdit && <button onClick={() => setEditing(true)} className={ghostButton}><Pencil size={13} />Edit draft</button>}
      {suggesting && (
        <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-slate-900 p-5">
          <h2 className="text-lg font-black text-white">Suggest an edit</h2>
          <p className="text-sm text-slate-400">Change the text below. A technician lead reviews it before it goes live.</p>
          <textarea value={proposal} onChange={(event) => setProposal(event.target.value)} rows={14} className={`${inputClass} font-mono`} aria-label="Suggested lesson text" />
          <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder="What did you change and why?" className={inputClass} aria-label="Note" />
          <div className="flex justify-end gap-2"><button onClick={() => setSuggesting(false)} className={ghostButton}>Cancel</button><button onClick={sendSuggestion} disabled={busy || proposal.trim() === page.body.trim()} className={primaryButton}>Send suggestion</button></div>
        </div>
      )}
      {!signedIn && page.status === 'published' && <p className="text-sm text-slate-400"><Link to="/auth" className="font-bold text-amber-400 hover:underline">Sign in</Link> as a technician to track your progress and suggest improvements.</p>}
    </article>
  );
}

export default function Learn() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const { user, ready } = useAuthUser();
  const [version, setVersion] = useState(0);
  const { state, error } = useWikiList(user?.uid ?? null, ready, version);

  useEffect(() => {
    if (slug) return;
    applySeoMetadata({ title: 'Technician Training & How-To Guides | TechSavvy', description: 'Field-tested guides for cabling, fiber, networking and cell signal work from the TechSavvy crew.', url: `${window.location.origin}/learn`, noIndex: !state || !state.pages.some((page) => page.visibility === 'public') });
  }, [slug, state]);

  const tracks = useMemo(() => [...new Set((state?.pages ?? []).map((page) => page.track))], [state]);
  let content;
  if (!ready || (!state && !error)) content = <Loading />;
  else if (error && !state) content = <ErrorNote message={error} />;
  else if (q) content = <SearchPanel q={q} />;
  else if (slug) content = <Lesson slug={slug} tracks={tracks} onChanged={() => setVersion((value) => value + 1)} />;
  else if (state) content = <Index list={state} onChanged={() => setVersion((value) => value + 1)} />;
  return <CommunityShell signedIn={Boolean(user)} searchTo="/learn" searchValue={q}>{content}</CommunityShell>;
}
