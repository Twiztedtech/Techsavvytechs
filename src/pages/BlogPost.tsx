import {ArrowLeft, Clock3, UserRound} from 'lucide-react'
import {useEffect} from 'react'
import {Link, useParams} from 'react-router'
import {PortableArticle} from '../components/blog/PortableArticle'
import {useSanityQuery} from '../hooks/useSanityQuery'
import {postBySlugQuery} from '../sanity/queries'
import type {BlogPost as BlogPostType} from '../sanity/types'
import {urlFor} from '../sanity/image'
import {applySeoMetadata} from '../components/Seo'

export default function BlogPost() {
  const {slug = ''} = useParams()
  const {data: post, loading, error} = useSanityQuery<BlogPostType | null>(postBySlugQuery, {slug})

  useEffect(() => {
    if (!post) return
    const socialImage = post.seo.image?.asset ? urlFor(post.seo.image).width(1200).height(630).fit('crop').url() : undefined
    applySeoMetadata({
      title: `${post.seo.title} | TechSavvy LLC`,
      description: post.seo.description,
      url: `${window.location.origin}/blog/${post.slug}`,
      image: socialImage,
      type: 'article',
      noIndex: post.seo.noIndex,
    })
  }, [post])

  if (loading) return <div className="mx-auto min-h-[70vh] max-w-5xl animate-pulse px-6 py-24"><div className="h-6 w-40 bg-brand-slate" /><div className="mt-12 h-20 max-w-3xl bg-brand-slate" /><div className="mt-10 aspect-[16/7] bg-brand-slate" /></div>
  if (error || !post) return <div className="grid min-h-[65vh] place-items-center px-6 text-center"><div><p className="font-mono text-xs uppercase tracking-[0.3em] text-safety-orange">404 // Briefing not found</p><h1 className="mt-5 font-display text-4xl font-extrabold">This article is not available.</h1><Link to="/blog" className="mt-8 inline-flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-tech-green"><ArrowLeft className="h-4 w-4" /> Back to the blog</Link></div></div>

  const published = new Intl.DateTimeFormat('en-US', {month: 'long', day: 'numeric', year: 'numeric'}).format(new Date(post.publishedAt))
  const imageUrl = post.mainImage?.asset ? urlFor(post.mainImage).width(1600).height(900).fit('crop').url() : null
  const canonicalUrl = `${window.location.origin}/blog/${post.slug}`
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article', headline: post.title,
    description: post.seo.description, datePublished: post.publishedAt, dateModified: post._updatedAt,
    mainEntityOfPage: canonicalUrl, image: imageUrl ? [imageUrl] : undefined,
    author: post.author?.name ? {'@type': 'Person', name: post.author.name} : {'@type': 'Organization', name: 'TechSavvy LLC'},
    publisher: {'@type': 'Organization', name: 'TechSavvy LLC'},
  }

  return (
    <article className="pb-24">
      <header className="mx-auto max-w-5xl px-6 pb-12 pt-16 md:pt-24">
        <Link to="/blog" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500 transition-colors hover:text-tech-green"><ArrowLeft className="h-4 w-4" /> All briefings</Link>
        <div className="mt-10 flex flex-wrap gap-2">{post.categories?.map((category) => <span key={category.title} className="rounded-full border border-tech-green/20 bg-tech-green/5 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-tech-green">{category.title}</span>)}</div>
        <h1 className="mt-6 font-display text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">{post.title}</h1>
        <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-400">{post.excerpt}</p>
        <div className="mt-8 flex flex-wrap items-center gap-5 text-xs font-mono uppercase tracking-widest text-slate-500">
          <time dateTime={post.publishedAt}>{published}</time><span className="text-tech-green">//</span>
          <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4" />{post.readingTime || 1} min read</span>
          {post.author?.name && <><span className="text-tech-green">//</span><span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4" />{post.author.name}</span></>}
        </div>
      </header>
      {imageUrl && <div className="mx-auto max-w-7xl px-6"><img src={imageUrl} alt={post.mainImage?.alt || ''} className="aspect-[16/8] w-full rounded-sm border border-white/10 object-cover" /></div>}
      <div className="mx-auto max-w-3xl px-6 pt-14">{post.body && <PortableArticle value={post.body} />}</div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd).replace(/</g, '\\u003c')}} />
    </article>
  )
}
