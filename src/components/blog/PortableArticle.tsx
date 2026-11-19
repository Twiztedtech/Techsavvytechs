import {PortableText, type PortableTextComponents} from '@portabletext/react'
import type {PortableTextBlock} from '@portabletext/react'
import {AlertTriangle, Info, Lightbulb, Zap} from 'lucide-react'
import type {SanityImage} from '../../sanity/types'
import {urlFor} from '../../sanity/image'

type Callout = {type?: 'tip' | 'warning' | 'info'; title?: string; text?: string}
type StatGrid = {stats?: Array<{_key?: string; value?: string; label?: string}>}
type KeyTakeaways = {points?: string[]}

const calloutStyles = {
  tip: {icon: Lightbulb, label: 'Tip', box: 'border-tech-green/30 bg-tech-green/5', accent: 'text-tech-green'},
  warning: {icon: AlertTriangle, label: 'Warning', box: 'border-safety-orange/40 bg-safety-orange/5', accent: 'text-safety-orange'},
  info: {icon: Info, label: 'Info', box: 'border-sky-400/30 bg-sky-400/5', accent: 'text-sky-300'},
} as const

const components: PortableTextComponents = {
  block: {
    normal: ({children}) => <p className="mb-6 text-base leading-8 text-slate-300 md:text-lg">{children}</p>,
    h2: ({children}) => <h2 className="mb-5 mt-14 font-display text-3xl font-extrabold text-brand-white">{children}</h2>,
    h3: ({children}) => <h3 className="mb-4 mt-10 font-display text-xl font-extrabold text-brand-white">{children}</h3>,
    h4: ({children}) => <h4 className="mb-3 mt-8 font-mono text-sm font-bold uppercase tracking-[0.18em] text-tech-green">{children}</h4>,
    blockquote: ({children}) => <blockquote className="my-10 border-l-2 border-safety-orange bg-brand-slate/60 px-7 py-6 text-xl italic leading-8 text-slate-200">{children}</blockquote>,
  },
  list: {
    bullet: ({children}) => <ul className="mb-7 ml-6 list-disc space-y-3 text-slate-300 marker:text-tech-green">{children}</ul>,
    number: ({children}) => <ol className="mb-7 ml-6 list-decimal space-y-3 text-slate-300 marker:text-tech-green">{children}</ol>,
  },
  marks: {
    strong: ({children}) => <strong className="font-semibold text-brand-white">{children}</strong>,
    em: ({children}) => <em className="italic">{children}</em>,
    code: ({children}) => <code className="rounded-sm border border-white/10 bg-brand-slate px-1.5 py-0.5 font-mono text-[0.9em] text-tech-green">{children}</code>,
    underline: ({children}) => <span className="underline underline-offset-4">{children}</span>,
    'strike-through': ({children}) => <s className="text-slate-500">{children}</s>,
    link: ({children, value}) => {
      const external = value?.openInNewTab || /^https?:\/\//.test(value?.href || '')
      return <a href={value?.href} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined} className="text-tech-green underline decoration-tech-green/40 underline-offset-4 hover:decoration-tech-green">{children}</a>
    },
  },
  types: {
    image: ({value}: {value: SanityImage}) => {
      if (!value?.asset) return null
      return (
        <figure className="my-10">
          <img src={urlFor(value).width(1200).fit('max').url()} alt={value.alt || ''} loading="lazy" className="w-full rounded-sm border border-white/10" />
          {value.caption && <figcaption className="mt-3 text-center text-xs text-slate-500">{value.caption}</figcaption>}
        </figure>
      )
    },
    callout: ({value}: {value: Callout}) => {
      const style = calloutStyles[value?.type || 'tip'] || calloutStyles.tip
      const Icon = style.icon
      return (
        <aside className={`my-10 flex gap-4 rounded-sm border p-6 ${style.box}`} aria-label={`${style.label}: ${value?.title || ''}`}>
          <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${style.accent}`} aria-hidden />
          <div>
            <p className={`font-mono text-[10px] uppercase tracking-[0.25em] ${style.accent}`}>{style.label}</p>
            {value?.title && <p className="mt-1 font-display text-lg font-extrabold text-brand-white">{value.title}</p>}
            {value?.text && <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-300 md:text-base">{value.text}</p>}
          </div>
        </aside>
      )
    },
    statGrid: ({value}: {value: StatGrid}) => {
      const stats = (value?.stats || []).filter((stat) => stat?.value)
      if (!stats.length) return null
      return (
        <div className="my-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-white/10 bg-white/10 sm:grid-cols-3 max-sm:[&>*:last-child:nth-child(odd)]:col-span-2">
          {stats.map((stat, index) => (
            <div key={stat._key || index} className="bg-brand-slate px-5 py-6 text-center">
              <p className="font-display text-2xl font-extrabold text-tech-green md:text-3xl">{stat.value}</p>
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>
      )
    },
    keyTakeaways: ({value}: {value: KeyTakeaways}) => {
      const points = (value?.points || []).filter(Boolean)
      if (!points.length) return null
      return (
        <section className="my-12 rounded-sm border border-tech-green/30 bg-brand-slate/70 p-7" aria-label="Key takeaways">
          <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-tech-green"><Zap className="h-4 w-4" aria-hidden /> Key takeaways</p>
          <ul className="mt-5 space-y-3">
            {points.map((point, index) => (
              <li key={index} className="flex gap-3 text-slate-300"><span className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-tech-green" aria-hidden /><span className="leading-7">{point}</span></li>
            ))}
          </ul>
        </section>
      )
    },
  },
}

export function PortableArticle({value}: {value: PortableTextBlock[]}) {
  return <PortableText value={value} components={components} />
}
