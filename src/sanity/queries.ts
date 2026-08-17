import {defineQuery} from 'groq'

const postCardProjection = `
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  featured,
  mainImage{asset, alt, crop, hotspot},
  author->{name, role, image{asset, alt, crop, hotspot}},
  "categories": categories[]->{title, "slug": slug.current},
  "readingTime": round(length(pt::text(body)) / 1200) + 1
`

export const postsQuery = defineQuery(`
  *[_type == "post" && defined(slug.current) && defined(publishedAt) && publishedAt <= now()]
    | order(featured desc, publishedAt desc) {
      ${postCardProjection}
    }
`)

export const postBySlugQuery = defineQuery(`
  *[_type == "post" && slug.current == $slug && defined(publishedAt) && publishedAt <= now()][0] {
    ${postCardProjection},
    _updatedAt,
    body[]{
      ...,
      _type == "image" => {asset, alt, caption, crop, hotspot}
    },
    "seo": {
      "title": coalesce(seo.title, title),
      "description": coalesce(seo.description, excerpt),
      "image": coalesce(seo.image, mainImage),
      "noIndex": seo.noIndex == true
    }
  }
`)
