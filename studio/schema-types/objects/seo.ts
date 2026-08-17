import {defineField, defineType} from 'sanity'

export const seo = defineType({
  name: 'seo',
  title: 'Search and social',
  type: 'object',
  fields: [
    defineField({name: 'title', title: 'SEO title', type: 'string'}),
    defineField({name: 'description', title: 'SEO description', type: 'text', rows: 3}),
    defineField({
      name: 'image',
      title: 'Social sharing image',
      description: '1200 × 630 pixels is recommended.',
      type: 'image',
      options: {hotspot: true},
    }),
    defineField({name: 'noIndex', title: 'Hide from search engines', type: 'boolean', initialValue: false}),
  ],
})
