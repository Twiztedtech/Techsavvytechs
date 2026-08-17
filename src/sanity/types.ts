import type {PortableTextBlock} from '@portabletext/react'

export type SanityImage = {
  asset?: {_ref?: string; url?: string}
  alt?: string
  caption?: string
  crop?: unknown
  hotspot?: unknown
}

export type BlogPostSummary = {
  _id: string
  title: string
  slug: string
  excerpt: string
  publishedAt: string
  featured?: boolean
  mainImage?: SanityImage
  author?: {name?: string; role?: string; image?: SanityImage}
  categories?: Array<{title: string; slug?: string}>
  readingTime?: number
}

export type BlogPost = BlogPostSummary & {
  _updatedAt: string
  body?: PortableTextBlock[]
  seo: {
    title: string
    description: string
    image?: SanityImage
    noIndex: boolean
  }
}
