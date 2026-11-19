import {defineField, defineType} from 'sanity'

// Reader comments. Submitted from the site (Phase 3) as unapproved; they only
// appear under a post after someone turns on "Approved" here in the Studio.
// The commenter's email is never stored in Sanity.
export const comment = defineType({
  name: 'comment',
  title: 'Comment',
  type: 'document',
  fields: [
    defineField({name: 'name', title: 'Name', type: 'string', validation: (rule) => rule.required().max(80)}),
    defineField({
      name: 'comment',
      title: 'Comment',
      type: 'text',
      rows: 4,
      validation: (rule) => rule.required().min(3).max(1500),
    }),
    defineField({
      name: 'post',
      title: 'Post',
      type: 'reference',
      to: [{type: 'post'}],
      // Weak, so a post can still be deleted while it has comments.
      weak: true,
      validation: (rule) => rule.required(),
    }),
    defineField({
      name: 'approved',
      title: 'Approved',
      type: 'boolean',
      description: 'Turn on to show this comment publicly under the post.',
      initialValue: false,
    }),
    defineField({
      name: 'createdAt',
      title: 'Submitted at',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
      readOnly: true,
    }),
  ],
  orderings: [{title: 'Newest first', name: 'createdAtDesc', by: [{field: 'createdAt', direction: 'desc'}]}],
  preview: {
    select: {name: 'name', comment: 'comment', approved: 'approved', postTitle: 'post.title'},
    prepare: ({name, comment, approved, postTitle}) => ({
      title: `${approved ? 'Approved' : 'Pending'} · ${name || 'Anonymous'}`,
      subtitle: `${postTitle ? `[${postTitle}] ` : ''}${comment || ''}`,
    }),
  },
})
