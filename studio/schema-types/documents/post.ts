import {defineArrayMember, defineField, defineType} from 'sanity'

export const post = defineType({
  name: 'post',
  title: 'Blog post',
  type: 'document',
  fields: [
    defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'title', maxLength: 96},
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Summary',
      description: 'Used on the blog listing and as the default search description.',
      type: 'text',
      rows: 3,
      validation: (rule) => rule.required().max(220),
    }),
    defineField({
      name: 'mainImage',
      title: 'Hero image',
      type: 'image',
      options: {hotspot: true},
      fields: [
        defineField({
          name: 'alt',
          title: 'Alternative text',
          type: 'string',
          validation: (rule) => rule.required().warning('Alternative text helps accessibility and SEO.'),
        }),
      ],
      validation: (rule) => rule.required(),
    }),
    defineField({name: 'author', title: 'Author', type: 'reference', to: [{type: 'author'}]}),
    defineField({
      name: 'categories',
      title: 'Categories',
      type: 'array',
      of: [defineArrayMember({type: 'reference', to: [{type: 'category'}]})],
    }),
    defineField({name: 'publishedAt', title: 'Published at', type: 'datetime', validation: (rule) => rule.required()}),
    defineField({name: 'featured', title: 'Featured post', type: 'boolean', initialValue: false}),
    defineField({
      name: 'mainVideo',
      title: 'Hero video (optional)',
      type: 'file',
      options: {accept: 'video/mp4,video/webm'},
      description: 'Replaces the hero image on the card and article. Short MP4 (H.264) or WebM, ideally under 10 MB; plays muted and loops. The hero image is still required and is used as the poster.',
      validation: (rule) =>
        rule.custom((value: {asset?: {_ref?: string}} | undefined) => {
          const ref = value?.asset?._ref
          return !ref || /-(mp4|webm)$/.test(ref) || 'Upload an MP4 or WebM video.'
        }),
    }),
    defineField({name: 'body', title: 'Article', type: 'blockContent', validation: (rule) => rule.required()}),
    defineField({name: 'seo', title: 'Search and social', type: 'seo'}),
  ],
  orderings: [{title: 'Newest first', name: 'publishedAtDesc', by: [{field: 'publishedAt', direction: 'desc'}]}],
  preview: {select: {title: 'title', subtitle: 'excerpt', media: 'mainImage'}},
})
