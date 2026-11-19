import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPage, isSafeSlug, portableTextToHtml, renderBlogIndex, renderPostPage, safeHref, sanityImageUrl } from '../scripts/prerender-blog-core.mjs';

const template = `<!doctype html><html><head>
<title>Old</title>
<meta name="description" content="old" />
<link rel="canonical" href="https://techsavvytechs.com/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
</head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`;

const span = (text: string, marks: string[] = []) => ({ _type: 'span', text, marks });
const block = (style: string, children: unknown[], extra: Record<string, unknown> = {}) => ({ _type: 'block', style, children, markDefs: [], ...extra });

test('isSafeSlug: plain slugs only', () => {
  assert.equal(isSafeSlug('cat6a-vs-cat6'), true);
  for (const bad of ['../etc', 'a/b', 'Upper', '', 'a--b-', null]) assert.equal(isSafeSlug(bad), false);
});

test('safeHref: blocks javascript and protocol-relative links', () => {
  assert.equal(safeHref('https://x.com'), 'https://x.com');
  assert.equal(safeHref('/contact'), '/contact');
  assert.equal(safeHref('mailto:a@b.co'), 'mailto:a@b.co');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('//evil.com'), null);
});

test('sanityImageUrl: builds CDN url from an asset ref', () => {
  const url = sanityImageUrl({ asset: { _ref: 'image-abc123-1600x900-jpg' } }, { w: 1200 });
  assert.equal(url, 'https://cdn.sanity.io/images/dnlgguay/production/abc123-1600x900.jpg?auto=format&w=1200');
  assert.equal(sanityImageUrl({ asset: { _ref: 'file-x' } }), null);
});

test('portableTextToHtml: escapes text, applies marks and safe links, groups lists', () => {
  const html = portableTextToHtml([
    block('h2', [span('Intro <script>')]),
    { ...block('normal', [span('bold', ['strong']), span(' and '), span('link', ['l1']), span(' bad', ['l2'])]), markDefs: [{ _key: 'l1', _type: 'link', href: 'https://a.com' }, { _key: 'l2', _type: 'link', href: 'javascript:x' }] },
    block('normal', [span('one')], { listItem: 'bullet', level: 1 }),
    block('normal', [span('nested')], { listItem: 'bullet', level: 2 }),
    block('normal', [span('two')], { listItem: 'bullet', level: 1 }),
    { _type: 'keyTakeaways', points: ['Point <b>'] },
  ]);
  assert.match(html, /<h2[^>]*>Intro &lt;script&gt;<\/h2>/);
  assert.match(html, /<strong[^>]*>bold<\/strong>/);
  assert.match(html, /<a href="https:\/\/a.com" target="_blank"/);
  assert.doesNotMatch(html, /javascript:/);
  assert.equal((html.match(/<ul class/g) || []).length, 3); // outer list, nested list, takeaways
  assert.match(html, /<li>one<ul[^>]*><li>nested<\/li><\/ul><\/li><li>two<\/li>/);
  assert.match(html, /Point &lt;b&gt;/);
});

test('buildPage: replaces head tags and fills root', () => {
  const html = buildPage(template, { title: 'T & co', description: 'D "q"', url: 'https://techsavvytechs.com/blog/x', jsonLd: { a: '</script>' }, bodyHtml: '<p>hi</p>' });
  assert.match(html, /<title>T &amp; co<\/title>/);
  assert.match(html, /content="D &quot;q&quot;"/);
  assert.match(html, /<link rel="canonical" href="https:\/\/techsavvytechs.com\/blog\/x" \/>/);
  assert.match(html, /<div id="root"><p>hi<\/p><\/div>/);
  assert.doesNotMatch(html, /<\/script>"/);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /\/assets\/app.js/);
});

test('renderPostPage and renderBlogIndex: article metadata, noindex, and links', () => {
  const post = { title: 'Fiber 101', slug: 'fiber-101', excerpt: 'Basics', publishedAt: '2026-11-01T00:00:00Z', body: [block('normal', [span('Body text')])], seo: { noIndex: true }, mainImage: { asset: { _ref: 'image-a1-800x400-png' }, alt: 'Rack' } };
  const page = renderPostPage(template, post);
  assert.match(page, /<title>Fiber 101 \| TechSavvy LLC<\/title>/);
  assert.match(page, /og:type" content="article"/);
  assert.match(page, /name="robots" content="noindex"/);
  assert.match(page, /"@type":"Article"/);
  assert.match(page, /Body text/);
  assert.match(page, /og:image" content="https:\/\/cdn.sanity.io/);
  const index = renderBlogIndex(template, [post]);
  assert.match(index, /href="\/blog\/fiber-101"/);
  assert.match(renderBlogIndex(template, []), /first briefing is being prepared/);
});
