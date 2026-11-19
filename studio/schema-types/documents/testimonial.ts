import {defineField, defineType} from 'sanity'

export const SERVICE_OPTIONS = [
  {title: 'Low-voltage cabling', value: 'cabling'},
  {title: 'Network infrastructure', value: 'network'},
  {title: 'Managed IT', value: 'managed-it'},
  {title: 'Cell signal', value: 'cell-signal'},
  {title: 'Other', value: 'other'},
]

// Customer reviews. Submitted from /reviews as unapproved; they appear on the
// site only after "Approved" is turned on here. The reviewer's email is kept
// server-side and never stored in Sanity.
export const testimonial = defineType({
  name: 'testimonial',
  title: 'Testimonial',
  type: 'document',
  fields: [
    defineField({name: 'name', title: 'Name (as shown)', type: 'string', validation: (rule) => rule.required().max(80)}),
    defineField({name: 'company', title: 'Company', type: 'string', validation: (rule) => rule.max(100)}),
    defineField({name: 'role', title: 'Role or title', type: 'string', validation: (rule) => rule.max(80)}),
    defineField({
      name: 'rating',
      title: 'Rating',
      type: 'number',
      options: {list: [5, 4, 3, 2, 1]},
      validation: (rule) => rule.required().integer().min(1).max(5),
    }),
    defineField({name: 'quote', title: 'Review', type: 'text', rows: 5, validation: (rule) => rule.required().min(20).max(1200)}),
    defineField({name: 'service', title: 'Service', type: 'string', options: {list: SERVICE_OPTIONS}}),
    defineField({
      name: 'photo',
      title: 'Headshot',
      type: 'image',
      description: 'Optional headshot of the reviewer, shown as a round avatar next to their name. Check it before approving; remove it here if it should not be shown.',
      options: {hotspot: true},
      fields: [defineField({name: 'alt', title: 'Alternative text', type: 'string'})],
    }),
    defineField({
      name: 'approved',
      title: 'Approved',
      type: 'boolean',
      description: 'Turn on to show this review on the public Reviews page.',
      initialValue: false,
    }),
    defineField({
      name: 'featured',
      title: 'Featured',
      type: 'boolean',
      description: 'Featured reviews are shown first.',
      initialValue: false,
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      readOnly: true,
      options: {list: [{title: 'Website form', value: 'website'}, {title: 'Review request email', value: 'review-request'}]},
    }),
    defineField({name: 'createdAt', title: 'Submitted at', type: 'datetime', initialValue: () => new Date().toISOString(), readOnly: true}),
  ],
  orderings: [{title: 'Newest first', name: 'createdAtDesc', by: [{field: 'createdAt', direction: 'desc'}]}],
  preview: {
    select: {name: 'name', company: 'company', rating: 'rating', quote: 'quote', approved: 'approved', media: 'photo'},
    prepare: ({name, company, rating, quote, approved, media}) => ({
      media,
      title: `${approved ? 'Approved' : 'Pending'} · ${'★'.repeat(rating || 0)} ${name || 'Anonymous'}${company ? `, ${company}` : ''}`,
      subtitle: quote || '',
    }),
  },
})
