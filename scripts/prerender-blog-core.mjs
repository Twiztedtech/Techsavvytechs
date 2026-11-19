// Pure helpers for scripts/prerender-blog.mjs: turn Sanity posts into static
// HTML pages so search engines get the full article without running JavaScript.
// React's createRoot replaces this markup once the app loads, so the classes
// mirror the live components to keep the swap seamless.

export const SITE_URL = 'https://techsavvytechs.com';
export const SANITY_PROJECT_ID = 'dnlgguay';
export const SANITY_DATASET = 'production';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Only plain, URL-safe slugs become folders on disk.
export const isSafeSlug = (slug) => typeof slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 120;

// image-<id>-<w>x<h>-<ext>  ->  https://cdn.sanity.io/images/<project>/<dataset>/<id>-<w>x<h>.<ext>
export function sanityImageUrl(image, params = {}) {
  const ref = image?.asset?._ref;
  const match = typeof ref === 'string' && ref.match(/^image-([A-Za-z0-9]+-\d+x\d+)-([a-z0-9]+)$/);
  if (!match) return null;
  const query = new URLSearchParams({ auto: 'format', ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  return `https://cdn.sanity.io/images/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${match[1]}.${match[2]}?${query}`;
}

// Links: only http(s), mailto, tel and site-relative paths survive.
export function safeHref(href) {
  const value = String(href ?? '').trim();
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  return null;
}

const MARKS = {
  strong: (t) => `<strong class="font-semibold text-brand-white">${t}</strong>`,
  em: (t) => `<em class="italic">${t}</em>`,
  code: (t) => `<code class="rounded-sm border border-white/10 bg-brand-slate px-1.5 py-0.5 font-mono text-[0.9em] text-tech-green">${t}</code>`,
  underline: (t) => `<span class="underline underline-offset-4">${t}</span>`,
  'strike-through': (t) => `<s class="text-slate-500">${t}</s>`,
};

function renderSpans(block) {
  const defs = new Map((block.markDefs || []).map((def) => [def._key, def]));
  return (block.children || []).map((span) => {
    let html = escapeHtml(span.text || '').replace(/\n/g, '<br>');
    for (const mark of span.marks || []) {
      if (MARKS[mark]) { html = MARKS[mark](html); continue; }
      const def = defs.get(mark);
      if (def?._type === 'link') {
        const href = safeHref(def.href);
        if (!href) continue;
        const external = def.openInNewTab || /^https?:\/\//i.test(href);
        html = `<a href="${escapeHtml(href)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''} class="text-tech-green underline decoration-tech-green/40 underline-offset-4">${html}</a>`;
      }
    }
    return html;
  }).join('');
}

const BLOCK_TAGS = {
  normal: (t) => `<p class="mb-6 text-base leading-8 text-slate-300 md:text-lg">${t}</p>`,
  h2: (t) => `<h2 class="mb-5 mt-14 font-display text-3xl font-extrabold text-brand-white">${t}</h2>`,
  h3: (t) => `<h3 class="mb-4 mt-10 font-display text-xl font-extrabold text-brand-white">${t}</h3>`,
  h4: (t) => `<h4 class="mb-3 mt-8 font-mono text-sm font-bold uppercase tracking-[0.18em] text-tech-green">${t}</h4>`,
  blockquote: (t) => `<blockquote class="my-10 border-l-2 border-safety-orange bg-brand-slate/60 px-7 py-6 text-xl italic leading-8 text-slate-200">${t}</blockquote>`,
};

const CALLOUT_LABELS = { tip: 'Tip', warning: 'Warning', info: 'Info' };

function renderCustom(block) {
  if (block._type === 'image') {
    const src = sanityImageUrl(block, { w: 1200, fit: 'max' });
    if (!src) return '';
    const caption = block.caption ? `<figcaption class="mt-3 text-center text-xs text-slate-500">${escapeHtml(block.caption)}</figcaption>` : '';
    return `<figure class="my-10"><img src="${escapeHtml(src)}" alt="${escapeHtml(block.alt || '')}" loading="lazy" class="w-full rounded-sm border border-white/10">${caption}</figure>`;
  }
  if (block._type === 'callout') {
    const label = CALLOUT_LABELS[block.type] || 'Tip';
    return `<aside class="my-10 rounded-sm border border-white/10 p-6"><p class="font-mono text-[10px] uppercase tracking-[0.25em] text-tech-green">${label}</p>${block.title ? `<p class="mt-1 font-display text-lg font-extrabold text-brand-white">${escapeHtml(block.title)}</p>` : ''}${block.text ? `<p class="mt-2 whitespace-pre-line text-sm leading-7 text-slate-300">${escapeHtml(block.text)}</p>` : ''}</aside>`;
  }
  if (block._type === 'statGrid') {
    const stats = (block.stats || []).filter((stat) => stat?.value);
    if (!stats.length) return '';
    return `<div class="my-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-white/10 bg-white/10 sm:grid-cols-3">${stats.map((stat) => `<div class="bg-brand-slate px-5 py-6 text-center"><p class="font-display text-2xl font-extrabold text-tech-green">${escapeHtml(stat.value)}</p><p class="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-slate-400">${escapeHtml(stat.label || '')}</p></div>`).join('')}</div>`;
  }
  if (block._type === 'keyTakeaways') {
    const points = (block.points || []).filter(Boolean);
    if (!points.length) return '';
    return `<section class="my-12 rounded-sm border border-tech-green/30 bg-brand-slate/70 p-7" aria-label="Key takeaways"><p class="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-tech-green">Key takeaways</p><ul class="mt-5 space-y-3">${points.map((point) => `<li class="leading-7 text-slate-300">${escapeHtml(point)}</li>`).join('')}</ul></section>`;
  }
  return '';
}

// Portable Text -> HTML. Consecutive list items are grouped into <ul>/<ol>,
// with deeper levels nested inside the previous item.
export function portableTextToHtml(blocks) {
  if (!Array.isArray(blocks)) return '';
  const out = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block?._type === 'block' && block.listItem) {
      const items = [];
      while (i < blocks.length && blocks[i]?._type === 'block' && blocks[i].listItem) items.push(blocks[i++]);
      out.push(renderList(items, 1));
      continue;
    }
    if (block?._type === 'block') {
      const tag = BLOCK_TAGS[block.style] || BLOCK_TAGS.normal;
      const inner = renderSpans(block);
      if (inner.trim()) out.push(tag(inner));
    } else if (block) {
      out.push(renderCustom(block));
    }
    i += 1;
  }
  return out.join('\n');
}

function renderList(items, level) {
  const type = items[0]?.listItem === 'number' ? 'ol' : 'ul';
  const cls = type === 'ol' ? 'mb-7 ml-6 list-decimal space-y-3 text-slate-300' : 'mb-7 ml-6 list-disc space-y-3 text-slate-300';
  const parts = [];
  let index = 0;
  while (index < items.length) {
    const item = items[index];
    const itemLevel = item.level || 1;
    if (itemLevel > level) {
      const nested = [];
      while (index < items.length && (items[index].level || 1) > level) nested.push(items[index++]);
      const nestedHtml = renderList(nested, level + 1);
      if (parts.length) parts[parts.length - 1] = parts[parts.length - 1].replace(/<\/li>$/, `${nestedHtml}</li>`);
      else parts.push(`<li>${nestedHtml}</li>`);
      continue;
    }
    parts.push(`<li>${renderSpans(item)}</li>`);
    index += 1;
  }
  return `<${type} class="${cls}">${parts.join('')}</${type}>`;
}

const formatDate = (iso) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(date);
};

// Rewrites the head of the built index.html for one page and puts content in #root.
export function buildPage(template, { title, description, url, image = null, type = 'website', noIndex = false, jsonLd = null, bodyHtml }) {
  let html = template;
  const replaceTag = (pattern, replacement) => {
    if (pattern.test(html)) html = html.replace(pattern, replacement);
    else html = html.replace('</head>', `    ${replacement}\n  </head>`);
  };
  replaceTag(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(title)}</title>`);
  replaceTag(/<meta name="description"[^>]*>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  replaceTag(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${escapeHtml(url)}" />`);
  replaceTag(/<meta property="og:type"[^>]*>/, `<meta property="og:type" content="${escapeHtml(type)}" />`);
  replaceTag(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  replaceTag(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);
  const extra = [
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    noIndex ? '<meta name="robots" content="noindex" />' : '',
    jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n    ');
  html = html.replace('</head>', `    ${extra}\n  </head>`);
  html = html.replace(/<div id="root"><\/div>/, `<div id="root">${bodyHtml}</div>`);
  return html;
}

export function renderPostPage(template, post) {
  const url = `${SITE_URL}/blog/${post.slug}`;
  const seoTitle = post.seo?.title || post.title;
  const description = post.seo?.description || post.excerpt || '';
  const socialImage = sanityImageUrl(post.seo?.image || post.mainImage, { w: 1200, h: 630, fit: 'crop' });
  const heroImage = sanityImageUrl(post.mainImage, { w: 1600, h: 900, fit: 'crop' });
  const published = formatDate(post.publishedAt);
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'Article', headline: post.title, description,
    datePublished: post.publishedAt, dateModified: post._updatedAt || post.publishedAt, mainEntityOfPage: url,
    image: heroImage ? [heroImage] : undefined,
    author: post.author?.name ? { '@type': 'Person', name: post.author.name } : { '@type': 'Organization', name: 'TechSavvy LLC' },
    publisher: { '@type': 'Organization', name: 'TechSavvy LLC' },
  };
  const categories = (post.categories || []).filter((c) => c?.title).map((c) => `<span class="rounded-full border border-tech-green/20 bg-tech-green/5 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-tech-green">${escapeHtml(c.title)}</span>`).join('');
  const bodyHtml = `<article class="pb-24" data-prerendered="blog-post">
<header class="mx-auto max-w-5xl px-6 pb-12 pt-16 md:pt-24">
<a href="/blog" class="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">All briefings</a>
${categories ? `<div class="mt-10 flex flex-wrap gap-2">${categories}</div>` : ''}
<h1 class="mt-6 font-display text-4xl font-extrabold leading-tight tracking-tight md:text-6xl">${escapeHtml(post.title)}</h1>
${post.excerpt ? `<p class="mt-7 max-w-3xl text-lg leading-8 text-slate-400">${escapeHtml(post.excerpt)}</p>` : ''}
<p class="mt-8 text-xs font-mono uppercase tracking-widest text-slate-500"><time datetime="${escapeHtml(post.publishedAt)}">${published}</time>${post.author?.name ? ` // ${escapeHtml(post.author.name)}` : ''}</p>
</header>
${heroImage ? `<div class="mx-auto max-w-7xl px-6"><img src="${escapeHtml(heroImage)}" alt="${escapeHtml(post.mainImage?.alt || '')}" class="aspect-[16/8] w-full rounded-sm border border-white/10 object-cover"></div>` : ''}
<div class="mx-auto max-w-3xl px-6 pt-14">
${portableTextToHtml(post.body)}
</div>
</article>`;
  return buildPage(template, { title: `${seoTitle} | TechSavvy LLC`, description, url, image: socialImage, type: 'article', noIndex: post.seo?.noIndex === true, jsonLd, bodyHtml });
}

export const BLOG_INDEX_TITLE = 'Technology & Infrastructure Insights | TechSavvy LLC';
export const BLOG_INDEX_DESCRIPTION = 'Technical briefings on infrastructure, low-voltage systems, managed IT, and reliable connectivity from the TechSavvy field team.';

export function renderBlogIndex(template, posts) {
  const items = posts.map((post) => `<li class="glass-card rounded-sm p-7"><p class="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500"><time datetime="${escapeHtml(post.publishedAt)}">${formatDate(post.publishedAt)}</time></p><h2 class="mt-4 text-xl font-display font-extrabold leading-tight text-brand-white"><a href="/blog/${post.slug}">${escapeHtml(post.title)}</a></h2>${post.excerpt ? `<p class="mt-4 text-sm leading-7 text-slate-400">${escapeHtml(post.excerpt)}</p>` : ''}</li>`).join('');
  const bodyHtml = `<div class="pb-24" data-prerendered="blog-index">
<header class="border-b border-white/5 px-6 py-20 md:py-28"><div class="mx-auto max-w-7xl"><h1 class="max-w-4xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight md:text-7xl">Practical insight for <span class="text-tech-green">connected operations.</span></h1><p class="mt-7 max-w-2xl text-lg leading-8 text-slate-400">Technical briefings on infrastructure, low-voltage systems, managed IT, and reliable connectivity, written for the people responsible for keeping businesses online.</p></div></header>
<section class="mx-auto max-w-7xl px-6 pt-16">${items ? `<ul class="grid gap-7 md:grid-cols-2 lg:grid-cols-3">${items}</ul>` : '<p class="text-slate-400">The first briefing is being prepared.</p>'}</section>
</div>`;
  return buildPage(template, {
    title: BLOG_INDEX_TITLE, description: BLOG_INDEX_DESCRIPTION, url: `${SITE_URL}/blog`, type: 'website',
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: 'TechSavvy Field Notes', url: `${SITE_URL}/blog` },
    bodyHtml,
  });
}
