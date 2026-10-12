import { useEffect, useRef, useState } from 'react';
import { Bold, Code, Heading2, History, ImagePlus, Link2, List, ListOrdered } from 'lucide-react';
import { CommunityError, communityRequest, timeAgo, uploadWikiImage, type Revision, type WikiPage } from './api';
import { Markdown } from './MarkdownView';
import { Badge, ErrorNote, ghostButton, inputClass, primaryButton } from './ui';

// Lesson editor for Technician Leads and admins: plain textarea + toolbar + live preview.

type Draft = {
  slug: string; title: string; track: string; summary: string; body: string; visibility: 'members' | 'public'; status: 'draft' | 'published'; order: number; estimatedMinutes: number; note: string;
};

const blank: Draft = { slug: '', title: '', track: '', summary: '', body: '', visibility: 'members', status: 'draft', order: 0, estimatedMinutes: 10, note: '' };

export function WikiEditor({ page, tracks, onSaved, onCancel }: { page?: WikiPage | null; tracks: string[]; onSaved: (slug: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(page ? { slug: page.slug, title: page.title, track: page.track, summary: page.summary, body: page.body, visibility: page.visibility, status: page.status, order: page.order, estimatedMinutes: page.estimatedMinutes, note: '' } : blank);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const patch = (value: Partial<Draft>) => setDraft((current) => ({ ...current, ...value }));

  useEffect(() => { setPreview(false); }, [page?.slug]);

  function wrap(before: string, after = before, placeholder = 'text') {
    const el = area.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = draft.body.slice(start, end) || placeholder;
    patch({ body: `${draft.body.slice(0, start)}${before}${selected}${after}${draft.body.slice(end)}` });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  function linePrefix(prefix: string) {
    const el = area.current;
    if (!el) return;
    const start = draft.body.lastIndexOf('\n', el.selectionStart - 1) + 1;
    patch({ body: `${draft.body.slice(0, start)}${prefix}${draft.body.slice(start)}` });
    requestAnimationFrame(() => el.focus());
  }
  async function addImage(file: File | undefined) {
    if (imageInput.current) imageInput.current.value = '';
    if (!file) return;
    setError('');
    try {
      const url = await uploadWikiImage(draft.slug, file);
      patch({ body: `${draft.body}${draft.body.endsWith('\n') || !draft.body ? '' : '\n'}\n![${file.name.replace(/\.[^.]+$/, '')}](${url})\n` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The image could not be uploaded.'); }
  }
  async function save(confirmPublic = false) {
    setBusy(true); setError('');
    try {
      const result = await communityRequest<{ slug: string }>('wiki-save', { body: { ...draft, confirmPublic } });
      onSaved(result.slug);
    } catch (reason) {
      if (reason instanceof CommunityError && reason.status === 409 && reason.payload.requiresConfirmation) {
        if (window.confirm(`${reason.message}\n\nMake this page public?`)) { await save(true); return; }
      } else setError(reason instanceof Error ? reason.message : 'Could not save the page.');
    } finally { setBusy(false); }
  }
  async function showHistory() {
    if (!page) return;
    try { setRevisions((await communityRequest<{ revisions: Revision[] }>('wiki-revisions', { query: { slug: page.slug } })).revisions); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not load the history.'); }
  }

  const toolbar = 'grid h-8 w-8 place-items-center rounded-lg border border-slate-700 text-slate-300 hover:border-amber-500/60 hover:text-amber-300';
  return (
    <div className="space-y-4 rounded-2xl border border-amber-500/30 bg-slate-900 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-white">{page ? 'Edit lesson' : 'New lesson'}</h2>
        {page && <button type="button" onClick={showHistory} className={ghostButton}><History size={13} />History</button>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-slate-300 sm:col-span-2">Title<input value={draft.title} onChange={(event) => patch({ title: event.target.value })} maxLength={120} className={inputClass} /></label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-300">Skill area (track)<input list="wiki-tracks" value={draft.track} onChange={(event) => patch({ track: event.target.value })} placeholder="Cabling, Fiber, Safety…" className={inputClass} /><datalist id="wiki-tracks">{tracks.map((track) => <option key={track} value={track} />)}</datalist></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium text-slate-300">Order<input type="number" value={draft.order} onChange={(event) => patch({ order: Number(event.target.value) })} className={inputClass} /></label>
          <label className="grid gap-1.5 text-sm font-medium text-slate-300">Minutes<input type="number" min={0} max={600} value={draft.estimatedMinutes} onChange={(event) => patch({ estimatedMinutes: Number(event.target.value) })} className={inputClass} /></label>
        </div>
        <label className="grid gap-1.5 text-sm font-medium text-slate-300 sm:col-span-2">Short summary (optional)<input value={draft.summary} onChange={(event) => patch({ summary: event.target.value })} maxLength={300} className={inputClass} /></label>
      </div>
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button type="button" className={toolbar} onClick={() => linePrefix('## ')} aria-label="Heading" title="Heading"><Heading2 size={15} /></button>
          <button type="button" className={toolbar} onClick={() => wrap('**')} aria-label="Bold" title="Bold"><Bold size={15} /></button>
          <button type="button" className={toolbar} onClick={() => wrap('`')} aria-label="Code" title="Code"><Code size={15} /></button>
          <button type="button" className={toolbar} onClick={() => linePrefix('- ')} aria-label="Bullet list" title="Bullet list"><List size={15} /></button>
          <button type="button" className={toolbar} onClick={() => linePrefix('1. ')} aria-label="Numbered list" title="Numbered list"><ListOrdered size={15} /></button>
          <button type="button" className={toolbar} onClick={() => wrap('[', '](https://)', 'link text')} aria-label="Link" title="Link"><Link2 size={15} /></button>
          <button type="button" className={toolbar} onClick={() => imageInput.current?.click()} aria-label="Insert image" title="Insert image"><ImagePlus size={15} /></button>
          <input ref={imageInput} type="file" accept="image/*" className="hidden" onChange={(event) => void addImage(event.target.files?.[0])} />
          <div className="ml-auto flex overflow-hidden rounded-lg border border-slate-700 text-xs font-bold">
            <button type="button" onClick={() => setPreview(false)} className={`px-3 py-1.5 ${!preview ? 'bg-amber-500 text-slate-950' : 'text-slate-300'}`}>Write</button>
            <button type="button" onClick={() => setPreview(true)} className={`px-3 py-1.5 ${preview ? 'bg-amber-500 text-slate-950' : 'text-slate-300'}`}>Preview</button>
          </div>
        </div>
        {preview ? <div className="min-h-64 rounded-xl border border-slate-700 bg-slate-950 p-4"><Markdown source={draft.body || '_Nothing to preview yet._'} /></div>
          : <textarea ref={area} value={draft.body} onChange={(event) => patch({ body: event.target.value })} rows={16} maxLength={60000} className={`${inputClass} font-mono`} placeholder={'# Lesson title\n\nExplain the skill step by step. Use checklists:\n\n- [ ] Step one\n- [ ] Step two'} aria-label="Lesson text" />}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5 text-sm font-medium text-slate-300">Status<select value={draft.status} onChange={(event) => patch({ status: event.target.value as Draft['status'] })} className={inputClass}><option value="draft">Draft (only leads see it)</option><option value="published">Published</option></select></label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-300">Who can read it<select value={draft.visibility} onChange={(event) => patch({ visibility: event.target.value as Draft['visibility'] })} className={inputClass}><option value="members">Signed-in technicians only</option><option value="public">Anyone on the internet</option></select></label>
        <label className="grid gap-1.5 text-sm font-medium text-slate-300">Change note<input value={draft.note} onChange={(event) => patch({ note: event.target.value })} maxLength={200} placeholder="What changed?" className={inputClass} /></label>
      </div>
      {draft.visibility === 'public' && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">Public lessons show up in search engines. Keep out customer names, prices, passwords and private site details.</p>}
      <ErrorNote message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={ghostButton}>Cancel</button>
        <button type="button" disabled={busy || draft.title.trim().length < 3 || !draft.body.trim()} onClick={() => void save()} className={primaryButton}>{busy ? 'Saving…' : draft.status === 'published' ? 'Save & publish' : 'Save draft'}</button>
      </div>
      {revisions && (
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Version history</h3>
          {revisions.map((revision) => (
            <div key={revision.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm">
              <span className="text-slate-300"><Badge tone="amber">v{revision.version}</Badge> {revision.editorName} · {timeAgo(revision.at)}{revision.note ? ` · ${revision.note}` : ''}</span>
              <button type="button" className={ghostButton} onClick={() => { patch({ body: revision.body, title: revision.title || draft.title, note: `Restored version ${revision.version}` }); setPreview(false); }}>Load this version</button>
            </div>
          ))}
          {!revisions.length && <p className="text-sm text-slate-500">No published versions yet.</p>}
        </div>
      )}
    </div>
  );
}
