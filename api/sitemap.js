const staticPaths = [
  '/',
  '/services/low-voltage',
  '/services/infrastructure',
  '/services/msp',
  '/services/cell-boosting',
  '/about/mission',
  '/about/service-areas',
  '/portal',
  '/contact',
  '/blog',
  '/privacy',
  '/terms',
]

const escapeXml = (value) => String(value).replace(/[<>&'\"]/g, (character) => ({
  '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
})[character])

export default async function handler(_request, response) {
  const origin = 'https://techsavvytechs.com'
  let posts = []

  try {
    const query = encodeURIComponent('*[_type == "post" && defined(slug.current) && seo.noIndex != true]{"slug": slug.current, _updatedAt}')
    const result = await fetch(`https://dnlgguay.apicdn.sanity.io/v2026-08-17/data/query/production?query=${query}`)
    if (result.ok) posts = (await result.json()).result || []
  } catch (error) {
    console.error('Unable to add blog posts to sitemap', error)
  }

  const urls = [
    ...staticPaths.map((path) => ({url: `${origin}${path}`})),
    ...posts.map((post) => ({url: `${origin}/blog/${post.slug}`, lastModified: post._updatedAt})),
  ]
  const entries = urls.map(({url, lastModified}) => `  <url><loc>${escapeXml(url)}</loc>${lastModified ? `<lastmod>${escapeXml(lastModified)}</lastmod>` : ''}</url>`).join('\n')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`

  response.setHeader('Content-Type', 'application/xml; charset=utf-8')
  response.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400')
  response.status(200).send(xml)
}
