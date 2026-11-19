import {CheckCircle2, ExternalLink, MessageSquareQuote, Send, Star} from 'lucide-react'
import {useEffect, useMemo, useState, type FormEvent} from 'react'
import {useSearchParams} from 'react-router'
import {useSanityQuery} from '../hooks/useSanityQuery'
import {GOOGLE_REVIEW_URL, SERVICE_LABELS} from '../lib/reviews'
import {approvedTestimonialsQuery} from '../sanity/queries'

type Testimonial = {_id: string; name: string; company?: string; role?: string; rating: number; quote: string; service?: string; createdAt?: string}

const inputClass = 'w-full rounded-sm border border-white/10 bg-brand-slate px-4 py-3 text-sm text-brand-white placeholder:text-slate-500 focus:border-tech-green/60 focus:outline-none focus:ring-1 focus:ring-tech-green/40'
const labelClass = 'mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-400'
const emptyForm = {name: '', email: '', company: '', role: '', service: '', quote: '', website: ''}

function Stars({value, size = 'h-4 w-4'}: {value: number; size?: string}) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`} role="img">
      {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`${size} ${n <= value ? 'fill-tech-green text-tech-green' : 'text-slate-600'}`} aria-hidden />)}
    </span>
  )
}

function StarPicker({value, onChange}: {value: number; onChange: (value: number) => void}) {
  const [hover, setHover] = useState(0)
  const shown = hover || value
  const words = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']
  return (
    <div className="flex items-center gap-4">
      <div className="flex gap-1" role="radiogroup" aria-label="Rating" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)} onClick={() => onChange(n)}
            className="rounded-sm p-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-tech-green">
            <Star className={`h-8 w-8 transition-colors ${n <= shown ? 'fill-tech-green text-tech-green' : 'text-slate-600'}`} aria-hidden />
          </button>
        ))}
      </div>
      <span className="font-mono text-xs uppercase tracking-[0.18em] text-slate-400">{shown ? words[shown] : 'Choose a rating'}</span>
    </div>
  )
}

export default function Reviews() {
  const {data, loading} = useSanityQuery<Testimonial[]>(approvedTestimonialsQuery)
  const reviews = data || []
  const [params] = useSearchParams()
  const ref = params.get('ref') || ''
  const [form, setForm] = useState(emptyForm)
  const [rating, setRating] = useState(0)
  const [consent, setConsent] = useState(false)
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [requestNote, setRequestNote] = useState<string | null>(null)

  const summary = useMemo(() => {
    if (!reviews.length) return null
    const average = reviews.reduce((sum, item) => sum + (item.rating || 0), 0) / reviews.length
    return {average: Math.round(average * 10) / 10, count: reviews.length}
  }, [reviews])

  // A personal link from a review request fills in who the customer is.
  useEffect(() => {
    if (!ref) return
    let cancelled = false
    fetch(`/api/contact?operation=review-request&ref=${encodeURIComponent(ref)}`)
      .then(async (response) => (response.ok ? response.json() : null))
      .then((info) => {
        if (cancelled || !info) return
        setForm((current) => ({...current, name: current.name || info.name || '', company: current.company || info.company || ''}))
        if (info.jobName) setRequestNote(`Reviewing: ${info.jobName}`)
        setTimeout(() => document.getElementById('write')?.scrollIntoView({behavior: 'smooth', block: 'start'}), 300)
      })
      .catch(() => { /* The form still works without a prefill. */ })
    return () => { cancelled = true }
  }, [ref])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!rating) { setError('Please choose a star rating.'); return }
    if (!consent) { setError('Please confirm we may publish your review.'); return }
    setStatus('sending')
    try {
      const response = await fetch('/api/contact?operation=testimonial', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({...form, rating, consent, ref: ref || undefined}),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Your review could not be sent.')
      setStatus('sent')
    } catch (submitError) {
      setStatus('idle')
      setError(submitError instanceof Error ? submitError.message : 'Your review could not be sent.')
    }
  }

  return (
    <div className="pb-24">
      <header className="border-b border-white/5 px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-tech-green/20 bg-tech-green/5 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-tech-green">
            <MessageSquareQuote className="h-3.5 w-3.5" /> Customer reviews
          </div>
          <h1 className="max-w-4xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">Results, in our <span className="text-tech-green">customers' words.</span></h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-400">Feedback from the businesses we cable, network, support and connect across Fairfield, Sacramento and the Bay Area.</p>
          <div className="mt-10 flex flex-wrap items-center gap-6">
            {summary && (
              <div className="flex items-center gap-4">
                <span className="font-display text-4xl font-extrabold text-brand-white">{summary.average.toFixed(1)}</span>
                <div><Stars value={Math.round(summary.average)} /><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500">{summary.count} review{summary.count === 1 ? '' : 's'}</p></div>
              </div>
            )}
            <a href="#write" className="inline-flex items-center gap-2 rounded-sm bg-tech-green px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-brand-black hover:opacity-90">Write a review</a>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-16" aria-label="Reviews">
        {loading ? (
          <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="h-64 animate-pulse rounded-sm border border-white/5 bg-brand-slate/50" />)}</div>
        ) : reviews.length ? (
          <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <figure key={review._id} className="glass-card flex flex-col rounded-sm p-8">
                <Stars value={review.rating} />
                <blockquote className="mt-5 flex-1 whitespace-pre-line text-base leading-7 text-slate-300">“{review.quote}”</blockquote>
                <figcaption className="mt-7 border-t border-white/5 pt-5">
                  <p className="font-bold text-brand-white">{review.name}</p>
                  {(review.role || review.company) && <p className="mt-1 text-sm text-slate-400">{[review.role, review.company].filter(Boolean).join(', ')}</p>}
                  {review.service && SERVICE_LABELS[review.service] && <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-tech-green">{SERVICE_LABELS[review.service]}</p>}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="glass-card rounded-sm px-8 py-16 text-center">
            <MessageSquareQuote className="mx-auto h-10 w-10 text-tech-green" />
            <h2 className="mt-5 font-display text-2xl font-extrabold">Be the first to leave a review.</h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">Worked with TechSavvy? Tell other businesses how it went.</p>
          </div>
        )}
      </section>

      <section id="write" className="mx-auto max-w-3xl scroll-mt-28 px-6 pt-24" aria-labelledby="write-heading">
        <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-tech-green">Share your experience</p>
        <h2 id="write-heading" className="mt-3 font-display text-3xl font-extrabold text-brand-white">Write a review</h2>
        {requestNote && <p className="mt-3 text-sm text-slate-400">{requestNote}</p>}

        {status === 'sent' ? (
          <div role="status" className="mt-8 rounded-sm border border-tech-green/30 bg-tech-green/5 p-7">
            <div className="flex gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-tech-green" aria-hidden />
              <div>
                <p className="text-lg font-bold text-brand-white">Thank you for the review.</p>
                <p className="mt-1 text-sm text-slate-400">It will appear on this page once it has been reviewed.</p>
              </div>
            </div>
            {GOOGLE_REVIEW_URL && (
              <div className="mt-6 border-t border-white/10 pt-6">
                <p className="text-sm text-slate-300">Would you also share it on Google? It is the single biggest help to a local business like ours.</p>
                <a href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-sm bg-tech-green px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-brand-black hover:opacity-90">
                  Post it on Google <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div>
              <span className={labelClass}>Your rating</span>
              <StarPicker value={rating} onChange={setRating} />
            </div>
            <label className="block">
              <span className={labelClass}>Your review</span>
              <textarea required minLength={20} maxLength={1200} rows={6} value={form.quote} onChange={(e) => setForm({...form, quote: e.target.value})} placeholder="What did we work on, and how did it go?" className={inputClass} />
              <span className="mt-1 block text-right font-mono text-[10px] text-slate-500">{form.quote.length}/1200</span>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>Name (as shown)</span><input required minLength={2} maxLength={80} autoComplete="name" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className={inputClass} /></label>
              <label className="block"><span className={labelClass}>Email <span className="font-normal normal-case tracking-normal text-slate-500">(never shown)</span></span><input required type="email" maxLength={150} autoComplete="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className={inputClass} /></label>
              <label className="block"><span className={labelClass}>Company <span className="font-normal normal-case tracking-normal text-slate-500">(optional)</span></span><input maxLength={100} autoComplete="organization" value={form.company} onChange={(e) => setForm({...form, company: e.target.value})} className={inputClass} /></label>
              <label className="block"><span className={labelClass}>Role <span className="font-normal normal-case tracking-normal text-slate-500">(optional)</span></span><input maxLength={80} autoComplete="organization-title" placeholder="e.g. Office manager" value={form.role} onChange={(e) => setForm({...form, role: e.target.value})} className={inputClass} /></label>
            </div>
            <label className="block">
              <span className={labelClass}>Service <span className="font-normal normal-case tracking-normal text-slate-500">(optional)</span></span>
              <select value={form.service} onChange={(e) => setForm({...form, service: e.target.value})} className={inputClass}>
                <option value="">Choose one</option>
                {Object.entries(SERVICE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({...form, website: e.target.value})} /></label>
            </div>
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 accent-[#8DC63F]" />
              <span>TechSavvy may publish my review, name, role and company on its website and marketing. My email is kept private.</span>
            </label>
            {error && <p role="alert" className="text-sm text-safety-orange">{error}</p>}
            <div className="flex flex-wrap items-center gap-4">
              <button type="submit" disabled={status === 'sending'} className="inline-flex items-center gap-2 rounded-sm bg-tech-green px-6 py-3 text-xs font-bold uppercase tracking-[0.16em] text-brand-black transition-opacity hover:opacity-90 disabled:opacity-50">
                <Send className="h-4 w-4" aria-hidden /> {status === 'sending' ? 'Sending…' : 'Submit review'}
              </button>
              <p className="text-xs text-slate-500">Reviews are checked before they appear.</p>
            </div>
          </form>
        )}
      </section>
    </div>
  )
}
