// Runs after `vite build`. Writes dist/blog/index.html and
// dist/blog/<slug>/index.html for every published post so crawlers get real
// content. Vercel serves these files before the SPA fallback rewrite. If Sanity
// cannot be reached the build still succeeds and the blog keeps working as a
// normal client-rendered page.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SANITY_DATASET, SANITY_PROJECT_ID, isSafeSlug, renderBlogIndex, renderPostPage } from './prerender-blog-core.mjs';

const dist = path.resolve(process.argv[2] || 'dist');
const query = `*[_type == "post" && defined(slug.current) && defined(publishedAt) && publishedAt <= now()] | order(featured desc, publishedAt desc) {
  _id, _updatedAt, title, "slug": slug.current, excerpt, publishedAt, mainImage,
  author->{name}, "categories": categories[]->{title}, body,
  "seo": {"title": seo.title, "description": seo.description, "image": seo.image, "noIndex": seo.noIndex == true}
}`;

async function fetchPosts() {
  const url = `https://${SANITY_PROJECT_ID}.apicdn.sanity.io/v2026-08-17/data/query/${SANITY_DATASET}?query=${encodeURIComponent(query)}&perspective=published`;
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Sanity responded ${response.status}`);
  const data = await response.json();
  return Array.isArray(data.result) ? data.result : [];
}

async function main() {
  let template;
  try { template = await readFile(path.join(dist, 'index.html'), 'utf8'); }
  catch { console.warn('[prerender-blog] dist/index.html not found, skipping.'); return; }

  let posts;
  try { posts = await fetchPosts(); }
  catch (error) { console.warn(`[prerender-blog] Could not load posts (${error.message}); blog stays client-rendered.`); return; }

  const safe = posts.filter((post) => {
    if (isSafeSlug(post.slug)) return true;
    console.warn(`[prerender-blog] Skipping post with unusual slug: ${JSON.stringify(post.slug)}`);
    return false;
  });

  await mkdir(path.join(dist, 'blog'), { recursive: true });
  await writeFile(path.join(dist, 'blog', 'index.html'), renderBlogIndex(template, safe));
  for (const post of safe) {
    const dir = path.join(dist, 'blog', post.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), renderPostPage(template, post));
  }
  console.log(`[prerender-blog] Wrote /blog and ${safe.length} article page(s).`);
}

main().catch((error) => {
  // Never fail the deploy over prerendering.
  console.warn(`[prerender-blog] Skipped: ${error.message}`);
});
