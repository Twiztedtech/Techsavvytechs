import {ArrowUpRight, Clock3} from 'lucide-react'
import {Link} from 'react-router'
import type {BlogPostSummary} from '../../sanity/types'
import {urlFor} from '../../sanity/image'

export function PostCard({post, featured = false}: {post: BlogPostSummary; featured?: boolean}) {
  const imageUrl = post.mainImage?.asset ? urlFor(post.mainImage).width(featured ? 1200 : 720).height(featured ? 720 : 440).fit('crop').url() : null
  const date = new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric'}).format(new Date(post.publishedAt))

  return (
    <article className={`group glass-card overflow-hidden rounded-sm transition-all hover:border-tech-green/40 ${featured ? 'grid lg:grid-cols-2' : 'flex h-full flex-col'}`}>
      <Link to={`/blog/${post.slug}`} className="block overflow-hidden bg-brand-slate" aria-label={`Read ${post.title}`}>
        {imageUrl ? (
          <img src={imageUrl} alt={post.mainImage?.alt || ''} className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03] ${featured ? 'min-h-80' : 'aspect-[16/10]'}`} />
        ) : (
          <div className={`blueprint-grid grid place-items-center text-xs font-mono uppercase tracking-[0.3em] text-slate-600 ${featured ? 'min-h-80' : 'aspect-[16/10]'}`}>Field Notes</div>
        )}
      </Link>
      <div className={`flex flex-1 flex-col ${featured ? 'p-8 md:p-12' : 'p-7'}`}>
        <div className="mb-5 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
          <time dateTime={post.publishedAt}>{date}</time>
          <span className="text-tech-green">//</span>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3 w-3" />{post.readingTime || 1} min</span>
        </div>
        {featured && <p className="mb-4 text-[10px] font-mono uppercase tracking-[0.3em] text-safety-orange">Featured briefing</p>}
        <h2 className={`${featured ? 'text-3xl md:text-4xl' : 'text-xl'} font-display font-extrabold leading-tight text-brand-white`}>
          <Link to={`/blog/${post.slug}`} className="transition-colors group-hover:text-tech-green">{post.title}</Link>
        </h2>
        <p className="mt-4 flex-1 text-sm leading-7 text-slate-400">{post.excerpt}</p>
        <Link to={`/blog/${post.slug}`} className="mt-7 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-tech-green">
          Read briefing <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-1 group-hover:-translate-y-1" />
        </Link>
      </div>
    </article>
  )
}
