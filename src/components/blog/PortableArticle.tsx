import {PortableText, type PortableTextComponents} from '@portabletext/react'
import type {PortableTextBlock} from '@portabletext/react'
import type {SanityImage} from '../../sanity/types'
import {urlFor} from '../../sanity/image'

const components: PortableTextComponents = {
  block: {
    normal: ({children}) => <p className="mb-6 text-base leading-8 text-slate-300 md:text-lg">{children}</p>,
    h2: ({children}) => <h2 className="mb-5 mt-14 font-display text-3xl font-extrabold text-brand-white">{children}</h2>,
    h3: ({children}) => <h3 className="mb-4 mt-10 font-display text-xl font-extrabold text-brand-white">{children}</h3>,
    blockquote: ({children}) => <blockquote className="my-10 border-l-2 border-safety-orange bg-brand-slate/60 px-7 py-6 text-xl italic leading-8 text-slate-200">{children}</blockquote>,
  },
  list: {
    bullet: ({children}) => <ul className="mb-7 ml-6 list-disc space-y-3 text-slate-300 marker:text-tech-green">{children}</ul>,
    number: ({children}) => <ol className="mb-7 ml-6 list-decimal space-y-3 text-slate-300 marker:text-tech-green">{children}</ol>,
  },
  marks: {
    strong: ({children}) => <strong className="font-semibold text-brand-white">{children}</strong>,
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
  },
}

export function PortableArticle({value}: {value: PortableTextBlock[]}) {
  return <PortableText value={value} components={components} />
}
