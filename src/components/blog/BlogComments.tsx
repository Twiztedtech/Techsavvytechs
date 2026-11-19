import {CheckCircle2, MessageSquare, Send} from 'lucide-react'
import {useState, type FormEvent} from 'react'
import {useSanityQuery} from '../../hooks/useSanityQuery'
import {approvedCommentsQuery} from '../../sanity/queries'

type ApprovedComment = {_id: string; name: string; comment: string; createdAt?: string}

const inputClass = 'w-full rounded-sm border border-white/10 bg-brand-slate px-4 py-3 text-sm text-brand-white placeholder:text-slate-500 focus:border-tech-green/60 focus:outline-none focus:ring-1 focus:ring-tech-green/40'

// Approved reader comments plus a form. New comments are held until they are
// approved in the Studio, so the form says so instead of showing them right away.
export function BlogComments({postId}: {postId: string}) {
  const {data: comments} = useSanityQuery<ApprovedComment[]>(approvedCommentsQuery, {postId})
  const [form, setForm] = useState({name: '', email: '', comment: '', website: ''})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const list = comments || []

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setStatus('sending')
    try {
      const response = await fetch('/api/contact?operation=blog-comment', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...form, postId}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Your comment could not be posted.')
      setStatus('sent')
      setForm({name: '', email: '', comment: '', website: ''})
    } catch (submitError) {
      setStatus('idle')
      setError(submitError instanceof Error ? submitError.message : 'Your comment could not be posted.')
    }
  }

  return (
    <section className="mt-20 border-t border-white/10 pt-12" aria-labelledby="comments-heading">
      <h2 id="comments-heading" className="flex items-center gap-3 font-display text-2xl font-extrabold text-brand-white">
        <MessageSquare className="h-6 w-6 text-tech-green" aria-hidden /> Comments
        <span className="font-mono text-xs font-normal uppercase tracking-[0.2em] text-slate-500">{list.length}</span>
      </h2>

      {list.length > 0 ? (
        <ol className="mt-8 space-y-5">
          {list.map((item) => (
            <li key={item._id} className="rounded-sm border border-white/10 bg-brand-slate/60 p-6">
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="font-bold text-brand-white">{item.name}</p>
                {item.createdAt && <time dateTime={item.createdAt} className="font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">{new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric'}).format(new Date(item.createdAt))}</time>}
              </div>
              <p className="mt-3 whitespace-pre-line text-sm leading-7 text-slate-300">{item.comment}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-6 text-sm text-slate-500">No comments yet. Start the conversation.</p>
      )}

      {status === 'sent' ? (
        <div role="status" className="mt-10 flex gap-3 rounded-sm border border-tech-green/30 bg-tech-green/5 p-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-tech-green" aria-hidden />
          <div>
            <p className="font-bold text-brand-white">Thanks, your comment was received.</p>
            <p className="mt-1 text-sm text-slate-400">Comments are reviewed before they appear here.</p>
            <button type="button" onClick={() => setStatus('idle')} className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-tech-green">Write another</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-10 space-y-4" noValidate={false}>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-tech-green">Leave a comment</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Name</span>
              <input required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Email <span className="font-normal normal-case tracking-normal text-slate-500">(never shown)</span></span>
              <input required type="email" maxLength={150} autoComplete="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Comment</span>
            <textarea required minLength={3} maxLength={1500} rows={5} value={form.comment} onChange={(e) => setForm({...form, comment: e.target.value})} className={inputClass} />
            <span className="mt-1 block text-right font-mono text-[10px] text-slate-500">{form.comment.length}/1500</span>
          </label>
          {/* Honeypot: hidden from people, filled in by bots. */}
          <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} /></label>
          </div>
          {error && <p role="alert" className="text-sm text-safety-orange">{error}</p>}
          <div className="flex flex-wrap items-center gap-4">
            <button type="submit" disabled={status === 'sending'} className="inline-flex items-center gap-2 rounded-sm bg-tech-green px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-brand-black transition-opacity hover:opacity-90 disabled:opacity-50">
              <Send className="h-4 w-4" aria-hidden /> {status === 'sending' ? 'Posting…' : 'Post comment'}
            </button>
            <p className="text-xs text-slate-500">Comments are reviewed before they appear.</p>
          </div>
        </form>
      )}
    </section>
  )
}
