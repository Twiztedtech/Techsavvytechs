import {BookOpen, Radio} from 'lucide-react'
import {PostCard} from '../components/blog/PostCard'
import {postsQuery} from '../sanity/queries'
import type {BlogPostSummary} from '../sanity/types'
import {useSanityQuery} from '../hooks/useSanityQuery'

function BlogSkeleton() {
  return <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">{[1, 2, 3].map((item) => <div key={item} className="h-[430px] animate-pulse rounded-sm border border-white/5 bg-brand-slate/50" />)}</div>
}

export default function Blog() {
  const {data: posts, loading, error} = useSanityQuery<BlogPostSummary[]>(postsQuery)
  const featured = posts?.[0]
  const remaining = posts?.slice(1) || []

  return (
    <div className="pb-24">
      <header className="border-b border-white/5 px-6 py-20 md:py-28">
        <div className="mx-auto max-w-7xl">
          <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-tech-green/20 bg-tech-green/5 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.25em] text-tech-green">
            <Radio className="h-3.5 w-3.5" /> Field intelligence
          </div>
          <h1 className="max-w-4xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">Practical insight for <span className="text-tech-green">connected operations.</span></h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-400">Technical briefings on infrastructure, low-voltage systems, managed IT, and reliable connectivity—written for the people responsible for keeping businesses online.</p>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 pt-16">
        {loading && <BlogSkeleton />}
        {error && <div className="glass-card rounded-sm p-10 text-center"><p className="font-mono text-xs uppercase tracking-widest text-safety-orange">Unable to reach the knowledge base</p><p className="mt-3 text-slate-400">Please try again shortly.</p></div>}
        {!loading && !error && !featured && (
          <div className="glass-card rounded-sm px-8 py-20 text-center">
            <BookOpen className="mx-auto h-10 w-10 text-tech-green" />
            <h2 className="mt-5 font-display text-2xl font-extrabold">The first briefing is being prepared.</h2>
            <p className="mx-auto mt-3 max-w-lg text-slate-400">Check back soon for practical guidance from the TechSavvy field team.</p>
          </div>
        )}
        {featured && <PostCard post={featured} featured />}
        {remaining.length > 0 && (
          <div className="mt-16">
            <div className="mb-8 flex items-center gap-4"><span className="h-px flex-1 bg-white/5" /><p className="font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Latest briefings</p><span className="h-px flex-1 bg-white/5" /></div>
            <div className="grid gap-7 md:grid-cols-2 lg:grid-cols-3">{remaining.map((post) => <div key={post._id}><PostCard post={post} /></div>)}</div>
          </div>
        )}
      </section>
    </div>
  )
}
