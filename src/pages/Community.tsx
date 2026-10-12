import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { CheckCircle2, ChevronRight, Flag, Lock, MessageSquare, Pencil, Pin, Plus, Trash2, Unlock, EyeOff, Bell, BellOff } from 'lucide-react';
import { applySeoMetadata } from '../components/Seo';
import { Markdown } from '../features/community/MarkdownView';
import {
  authReady, communityRequest, timeAgo,
  type Category, type Photo, type Reply, type Thread, type Viewer, type WikiSummary,
} from '../features/community/api';
import {
  Badge, CommunityShell, ErrorNote, Loading, PhotoPicker, PhotoStrip, SignInPrompt, ghostButton, inputClass, primaryButton, useAuthUser,
} from '../features/community/ui';

const EDIT_WINDOW_MS = 15 * 60 * 1000;
// The server sends a flattened one-line excerpt of the raw text; drop the markdown symbols for the list view.
const plainExcerpt = (text: string) => text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>]/g, '').replace(/\s-\s/g, ' · ').replace(/\s+/g, ' ').trim();
const message = (reason: unknown) => (reason instanceof Error ? reason.message : 'Something went wrong. Please try again.');

function ThreadRow({ thread, categories }: { thread: Thread; categories: Category[] }) {
  const category = categories.find((item) => item.id === thread.categoryId);
  return (
    <Link to={`/community/t/${thread.id}`} className="group block rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-amber-500/50">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        {thread.pinned && <Badge tone="amber"><Pin size={10} className="mr-1" />Pinned</Badge>}
        {thread.solvedReplyId && <Badge tone="green"><CheckCircle2 size={10} className="mr-1" />Answered</Badge>}
        {thread.locked && <Badge><Lock size={10} className="mr-1" />Locked</Badge>}
        {thread.status === 'hidden' && <Badge tone="red">Hidden</Badge>}
        {category && <Badge>{category.name}</Badge>}
      </div>
      <h3 className="font-bold text-white group-hover:text-amber-300">{thread.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-400">{plainExcerpt(thread.excerpt)}</p>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
        <span>{thread.authorName}{thread.authorRole && thread.authorRole !== 'Technician' ? ` · ${thread.authorRole}` : ''}</span>
        <span className="flex items-center gap-1"><MessageSquare size={12} />{thread.replyCount}</span>
        <span>{timeAgo(thread.lastActivityAt)}</span>
      </p>
    </Link>
  );
}

function NewThread({ categories, initialCategory, onCreated }: { categories: Category[]; initialCategory: string; onCreated: (id: string) => void }) {
  const open = categories.filter((category) => !category.archived);
  const [categoryId, setCategoryId] = useState(initialCategory || open[0]?.id || '');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { id } = await communityRequest<{ id: string }>('create-thread', { body: { categoryId, title, body, photos } });
      onCreated(id);
    } catch (reason) { setError(message(reason)); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-amber-500/30 bg-slate-900 p-5">
      <h2 className="text-lg font-black text-white">Start a discussion</h2>
      <label className="grid gap-1.5 text-sm font-medium text-slate-300">Category
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={inputClass}>{open.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-300">Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} placeholder="What do you need help with, or want to share?" className={inputClass} required />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-300">Details
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={6} maxLength={8000} placeholder="Describe the problem, what you tried, and the equipment involved. Do not post customer names, prices or passwords." className={inputClass} required />
        <span className="text-xs font-normal text-slate-500">Formatting: **bold**, *italic*, `code`, - bullet lists, 1. numbered lists.</span>
      </label>
      <PhotoPicker photos={photos} onChange={setPhotos} />
      <ErrorNote message={error} />
      <div className="flex justify-end"><button type="submit" disabled={busy || !title.trim() || !body.trim() || !categoryId} className={primaryButton}>{busy ? 'Posting…' : 'Post'}</button></div>
    </form>
  );
}

function Home({ categories, viewer, categoryId }: { categories: Category[]; viewer: Viewer; categoryId?: string }) {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(false);
  const category = categories.find((item) => item.id === categoryId);
  useEffect(() => {
    setThreads(null); setError('');
    communityRequest<{ threads: Thread[] }>('threads', { query: { categoryId } }).then((result) => setThreads(result.threads)).catch((reason) => setError(message(reason)));
  }, [categoryId]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-amber-400">{category ? 'Community' : 'Technician community'}</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">{category ? category.name : 'Talk shop with the crew'}</h1>
          <p className="mt-1 text-sm text-slate-400">{category?.description || 'Ask questions, share what you learned on the job, and help each other.'}</p>
        </div>
        <button onClick={() => setComposing((value) => !value)} className={primaryButton}><Plus size={16} />New post</button>
      </div>
      {composing && <NewThread categories={categories} initialCategory={categoryId || ''} onCreated={(id) => navigate(`/community/t/${id}`)} />}
      {!categoryId && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.filter((item) => !item.archived || viewer.canModerate).map((item) => (
            <Link key={item.id} to={`/community/c/${item.id}`} className="group flex items-start justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4 transition hover:border-amber-500/50">
              <div className="min-w-0"><h3 className="font-bold text-white group-hover:text-amber-300">{item.name}{item.archived ? ' (archived)' : ''}</h3><p className="mt-1 line-clamp-2 text-xs text-slate-400">{item.description}</p><p className="mt-2 text-xs text-slate-500">{item.threadCount} {item.threadCount === 1 ? 'discussion' : 'discussions'}{item.lastActivityAt ? ` · ${timeAgo(item.lastActivityAt)}` : ''}</p></div>
              <ChevronRight size={18} className="mt-1 shrink-0 text-slate-600 group-hover:text-amber-400" />
            </Link>
          ))}
        </div>
      )}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">{categoryId ? 'Discussions' : 'Recent discussions'}</h2>
        <ErrorNote message={error} />
        {!threads && !error && <Loading />}
        {threads && !threads.length && <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center text-sm text-slate-400">No discussions yet. Be the first to post.</div>}
        <div className="grid gap-3">{threads?.map((thread) => <Fragment key={thread.id}><ThreadRow thread={thread} categories={categories} /></Fragment>)}</div>
      </section>
    </div>
  );
}

function SearchResults({ q, categories }: { q: string; categories: Category[] }) {
  const [result, setResult] = useState<{ threads: Thread[]; pages: WikiSummary[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setResult(null); setError('');
    communityRequest<{ threads: Thread[]; pages: WikiSummary[] }>('search', { query: { q } }).then(setResult).catch((reason) => setError(message(reason)));
  }, [q]);
  return (
    <div className="space-y-6">
      <div><Link to="/community" className="text-xs font-semibold text-amber-400 hover:underline">← All discussions</Link><h1 className="mt-1 text-2xl font-black text-white">Results for “{q}”</h1></div>
      <ErrorNote message={error} />
      {!result && !error && <Loading label="Searching…" />}
      {result && (
        <>
          <section><h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Lessons and guides</h2>
            {!result.pages.length && <p className="text-sm text-slate-500">No matching lessons.</p>}
            <div className="grid gap-3">{result.pages.map((page) => <Link key={page.slug} to={`/learn/${page.slug}`} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4 hover:border-amber-500/50"><Badge tone="amber">{page.track}</Badge><h3 className="mt-1.5 font-bold text-white">{page.title}</h3><p className="mt-1 line-clamp-2 text-sm text-slate-400">{page.summary}</p></Link>)}</div>
          </section>
          <section><h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-400">Discussions</h2>
            {!result.threads.length && <p className="text-sm text-slate-500">No matching discussions.</p>}
            <div className="grid gap-3">{result.threads.map((thread) => <Fragment key={thread.id}><ThreadRow thread={thread} categories={categories} /></Fragment>)}</div>
          </section>
        </>
      )}
    </div>
  );
}

function EditBox({ initial, withTitle, onSave, onCancel }: { initial: { title?: string; body: string }; withTitle?: boolean; onSave: (value: { title: string; body: string }) => Promise<void>; onCancel: () => void }) {
  const [title, setTitle] = useState(initial.title || '');
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try { await onSave({ title, body }); } catch (reason) { setError(message(reason)); setBusy(false); }
  }
  return (
    <div className="space-y-2">
      {withTitle && <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={140} className={inputClass} aria-label="Title" />}
      <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} className={inputClass} aria-label="Post text" />
      <ErrorNote message={error} />
      <div className="flex gap-2"><button onClick={save} disabled={busy || !body.trim()} className={primaryButton}>{busy ? 'Saving…' : 'Save'}</button><button onClick={onCancel} className={ghostButton}>Cancel</button></div>
    </div>
  );
}

function ThreadView({ id, categories, viewer }: { id: string; categories: Category[]; viewer: Viewer }) {
  const navigate = useNavigate();
  const [data, setData] = useState<{ thread: Thread; replies: Reply[] } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyPhotos, setReplyPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);

  const load = useCallback(async (quiet = false) => {
    try { setData(await communityRequest<{ thread: Thread; replies: Reply[] }>('thread', { query: { id } })); if (!quiet) setError(''); }
    catch (reason) { if (!quiet) setError(message(reason)); }
  }, [id]);
  useEffect(() => { setData(null); void load(); }, [load]);
  // Quiet refresh so replies from the crew appear without reloading.
  useEffect(() => {
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !editing && !replyText) void load(true); }, 20000);
    return () => window.clearInterval(timer);
  }, [load, editing, replyText]);

  async function act(action: string, body: Record<string, unknown>, done?: string): Promise<boolean> {
    setNotice(''); setError('');
    try { await communityRequest(action, { body }); if (done) setNotice(done); await load(true); return true; }
    catch (reason) { setError(message(reason)); return false; }
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault();
    setSending(true); setError('');
    try { await communityRequest('reply', { body: { threadId: id, body: replyText, photos: replyPhotos } }); setReplyText(''); setReplyPhotos([]); await load(true); }
    catch (reason) { setError(message(reason)); }
    finally { setSending(false); }
  }
  async function report(targetType: 'thread' | 'reply', targetId: string) {
    const reason = window.prompt('What is wrong with this post? A moderator will review it.');
    if (reason === null) return;
    await act('report', { targetType, targetId, reason }, 'Thanks. A moderator will take a look.');
  }

  if (error && !data) return <div className="space-y-4"><Link to="/community" className="text-xs font-semibold text-amber-400 hover:underline">← All discussions</Link><ErrorNote message={error} /></div>;
  if (!data) return <Loading />;
  const { thread, replies } = data;
  const category = categories.find((item) => item.id === thread.categoryId);
  const canEditNow = (createdAt: string) => Date.now() - Date.parse(createdAt) <= EDIT_WINDOW_MS;
  const canMark = thread.mine || viewer.canModerate;
  const hidden = thread.status === 'hidden';

  return (
    <div className="space-y-6">
      <Link to={category ? `/community/c/${category.id}` : '/community'} className="text-xs font-semibold text-amber-400 hover:underline">← {category ? category.name : 'All discussions'}</Link>
      <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {thread.pinned && <Badge tone="amber"><Pin size={10} className="mr-1" />Pinned</Badge>}
          {thread.solvedReplyId && <Badge tone="green"><CheckCircle2 size={10} className="mr-1" />Answered</Badge>}
          {thread.locked && <Badge><Lock size={10} className="mr-1" />Locked</Badge>}
          {hidden && <Badge tone="red">Hidden from technicians</Badge>}
          {category && <Badge>{category.name}</Badge>}
        </div>
        <h1 className="text-2xl font-black text-white">{thread.title}</h1>
        <p className="mt-1 text-xs text-slate-500">{thread.authorName}{thread.authorRole && thread.authorRole !== 'Technician' ? ` · ${thread.authorRole}` : ''} · {timeAgo(thread.createdAt)}{thread.editedAt ? ' · edited' : ''}</p>
        {editing === `t:${thread.id}` ? (
          <div className="mt-4"><EditBox withTitle initial={{ title: thread.title, body: thread.body || '' }} onCancel={() => setEditing('')} onSave={async (value) => { await communityRequest('edit-post', { body: { type: 'thread', id: thread.id, ...value } }); setEditing(''); await load(true); }} /></div>
        ) : (
          <>
            <Markdown source={thread.body || ''} className="mt-4" />
            <PhotoStrip photos={thread.photos} />
          </>
        )}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          <button className={ghostButton} onClick={() => void act('follow', { threadId: id, follow: !thread.following })}>{thread.following ? <BellOff size={13} /> : <Bell size={13} />}{thread.following ? 'Unfollow' : 'Follow replies'}</button>
          {thread.mine && canEditNow(thread.createdAt) && editing !== `t:${thread.id}` && <button className={ghostButton} onClick={() => setEditing(`t:${thread.id}`)}><Pencil size={13} />Edit</button>}
          {!thread.mine && <button className={ghostButton} onClick={() => void report('thread', thread.id)}><Flag size={13} />Report</button>}
          {(thread.mine || viewer.canModerate) && <button className={ghostButton} onClick={() => { if (window.confirm('Remove this discussion?')) void act('delete-post', { type: 'thread', id: thread.id }).then((ok) => { if (ok) navigate('/community'); }); }}><Trash2 size={13} />Remove</button>}
        </div>
        {viewer.canModerate && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400">Moderator</span>
            {thread.pinned ? <button className={ghostButton} onClick={() => void act('moderate', { threadId: id, op: 'unpin' })}><Pin size={13} />Unpin</button> : (
              <>
                <button className={ghostButton} onClick={() => void act('moderate', { threadId: id, op: 'pin' })}><Pin size={13} />Pin</button>
                <button className={ghostButton} onClick={() => { if (window.confirm('Pin this and email/text every active technician about it?')) void act('moderate', { threadId: id, op: 'pin', announce: true }, 'Pinned and announced.'); }}><Bell size={13} />Pin &amp; announce</button>
              </>
            )}
            <button className={ghostButton} onClick={() => void act('moderate', { threadId: id, op: thread.locked ? 'unlock' : 'lock' })}>{thread.locked ? <Unlock size={13} /> : <Lock size={13} />}{thread.locked ? 'Unlock' : 'Lock'}</button>
            <button className={ghostButton} onClick={() => void act('moderate', { threadId: id, op: hidden ? 'unhide' : 'hide' })}><EyeOff size={13} />{hidden ? 'Unhide' : 'Hide'}</button>
          </div>
        )}
      </article>
      {notice && <p role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{notice}</p>}
      <ErrorNote message={error} />

      <section aria-label="Replies" className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</h2>
        {replies.map((reply) => {
          const solved = thread.solvedReplyId === reply.id;
          if (reply.removed && !reply.body) return <div key={reply.id} className="rounded-2xl border border-dashed border-slate-800 px-4 py-3 text-sm italic text-slate-500">This reply was removed.</div>;
          return (
            <div key={reply.id} id={`reply-${reply.id}`} className={`rounded-2xl border p-4 ${solved ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/80'} ${reply.removed ? 'opacity-60' : ''}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <strong className="text-sm text-slate-200">{reply.authorName}</strong>{reply.authorRole && reply.authorRole !== 'Technician' && <Badge>{reply.authorRole}</Badge>}
                <span>{timeAgo(reply.createdAt)}{reply.editedAt ? ' · edited' : ''}</span>
                {solved && <Badge tone="green"><CheckCircle2 size={10} className="mr-1" />Accepted answer</Badge>}
                {reply.removed && <Badge tone="red">Removed (moderators only)</Badge>}
              </div>
              {editing === `r:${reply.id}` ? (
                <EditBox initial={{ body: reply.body || '' }} onCancel={() => setEditing('')} onSave={async (value) => { await communityRequest('edit-post', { body: { type: 'reply', id: reply.id, body: value.body } }); setEditing(''); await load(true); }} />
              ) : (
                <><Markdown source={reply.body || ''} /><PhotoStrip photos={reply.photos} /></>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {canMark && !reply.removed && <button className={ghostButton} onClick={() => void act('mark-answer', { threadId: id, replyId: solved ? '' : reply.id })}><CheckCircle2 size={13} />{solved ? 'Unmark answer' : 'Mark as answer'}</button>}
                {reply.mine && canEditNow(reply.createdAt) && editing !== `r:${reply.id}` && <button className={ghostButton} onClick={() => setEditing(`r:${reply.id}`)}><Pencil size={13} />Edit</button>}
                {!reply.mine && !reply.removed && <button className={ghostButton} onClick={() => void report('reply', reply.id)}><Flag size={13} />Report</button>}
                {(reply.mine || viewer.canModerate) && !reply.removed && <button className={ghostButton} onClick={() => { if (window.confirm('Remove this reply?')) void act(viewer.canModerate && !reply.mine ? 'moderate' : 'delete-post', viewer.canModerate && !reply.mine ? { replyId: reply.id, op: 'hide' } : { type: 'reply', id: reply.id }); }}><Trash2 size={13} />Remove</button>}
                {viewer.canModerate && reply.removed && <button className={ghostButton} onClick={() => void act('moderate', { replyId: reply.id, op: 'unhide' })}>Restore</button>}
              </div>
            </div>
          );
        })}
      </section>

      {thread.locked && !viewer.canModerate ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400"><Lock size={14} className="mr-1.5 inline" />This discussion is locked, so it is not taking new replies.</p>
      ) : (
        <form onSubmit={sendReply} className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <label className="grid gap-1.5 text-sm font-medium text-slate-300">Your reply
            <textarea value={replyText} onChange={(event) => setReplyText(event.target.value)} rows={4} maxLength={4000} placeholder="Share what worked for you…" className={inputClass} />
          </label>
          <PhotoPicker photos={replyPhotos} onChange={setReplyPhotos} />
          <div className="flex justify-end"><button type="submit" disabled={sending || !replyText.trim()} className={primaryButton}>{sending ? 'Sending…' : 'Reply'}</button></div>
        </form>
      )}
    </div>
  );
}

export default function Community() {
  const { categoryId, threadId } = useParams();
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  const { user, ready } = useAuthUser();
  const [boot, setBoot] = useState<{ categories: Category[]; viewer: Viewer } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { applySeoMetadata({ title: 'Community | TechSavvy', description: 'TechSavvy technician community.', url: `${window.location.origin}/community`, noIndex: true }); }, []);
  useEffect(() => {
    if (!ready) return;
    if (!user) { setBoot(null); return; }
    let cancelled = false;
    authReady().then(() => communityRequest<{ categories: Category[]; viewer: Viewer }>('categories')).then((result) => { if (!cancelled) setBoot(result); }).catch((reason) => { if (!cancelled) setError(message(reason)); });
    return () => { cancelled = true; };
  }, [ready, user]);

  let content;
  if (!ready) content = <Loading />;
  else if (!user) content = <SignInPrompt title="Technician community" body="Sign in with your TechSavvy technician account to join the discussion." />;
  else if (error) content = <div className="mx-auto max-w-md space-y-3"><ErrorNote message={error} /><Link to="/contractor/dashboard" className={ghostButton}>Back to the portal</Link></div>;
  else if (!boot) content = <Loading />;
  else if (q) content = <SearchResults q={q} categories={boot.categories} />;
  else if (threadId) content = <ThreadView id={threadId} categories={boot.categories} viewer={boot.viewer} />;
  else content = <Home categories={boot.categories} viewer={boot.viewer} categoryId={categoryId} />;

  return <CommunityShell signedIn={Boolean(user)} searchTo="/community" searchValue={q}>{content}</CommunityShell>;
}
