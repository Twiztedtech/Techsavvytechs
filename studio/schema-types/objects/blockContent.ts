import {defineArrayMember, defineField, defineType} from 'sanity'

// Article body, modelled on the willjacksons.com blog: rich text plus three
// custom blocks (callout, stat grid, key takeaways). Existing posts stay valid:
// every style, mark and block they already use is still allowed here.
export const blockContent = defineType({
  name: 'blockContent',
  title: 'Article',
  type: 'array',
  of: [
    defineArrayMember({
      type: 'block',
      styles: [
        {title: 'Normal', value: 'normal'},
        {title: 'Heading 2', value: 'h2'},
        {title: 'Heading 3', value: 'h3'},
        {title: 'Heading 4', value: 'h4'},
        {title: 'Quote', value: 'blockquote'},
      ],
      lists: [
        {title: 'Bullet', value: 'bullet'},
        {title: 'Numbered', value: 'number'},
      ],
      marks: {
        decorators: [
          {title: 'Bold', value: 'strong'},
          {title: 'Italic', value: 'em'},
          {title: 'Code', value: 'code'},
          {title: 'Underline', value: 'underline'},
          {title: 'Strikethrough', value: 'strike-through'},
        ],
        annotations: [
          {
            name: 'link',
            type: 'object',
            title: 'Link',
            fields: [
              defineField({
                name: 'href',
                title: 'URL',
                type: 'url',
                validation: (rule) => rule.uri({allowRelative: true, scheme: ['http', 'https', 'mailto', 'tel']}),
              }),
              defineField({name: 'openInNewTab', title: 'Open in a new tab', type: 'boolean'}),
            ],
          },
        ],
      },
    }),
    defineArrayMember({
      type: 'image',
      options: {hotspot: true},
      fields: [
        defineField({name: 'alt', title: 'Alternative text', type: 'string', validation: (rule) => rule.required()}),
        defineField({name: 'caption', title: 'Caption', type: 'string'}),
      ],
    }),
    defineArrayMember({
      name: 'callout',
      title: 'Callout box',
      type: 'object',
      fields: [
        defineField({
          name: 'type',
          title: 'Type',
          type: 'string',
          options: {
            list: [
              {title: 'Tip', value: 'tip'},
              {title: 'Warning', value: 'warning'},
              {title: 'Info', value: 'info'},
            ],
            layout: 'radio',
          },
          initialValue: 'tip',
        }),
        defineField({name: 'title', title: 'Title', type: 'string', validation: (rule) => rule.required()}),
        defineField({name: 'text', title: 'Text', type: 'text', rows: 3, validation: (rule) => rule.required()}),
      ],
      preview: {
        select: {title: 'title', subtitle: 'text', type: 'type'},
        prepare: ({title, subtitle, type}) => ({
          title: `${({tip: 'Tip', warning: 'Warning', info: 'Info'} as Record<string, string>)[type] || 'Tip'}: ${title || 'Callout'}`,
          subtitle,
        }),
      },
    }),
    defineArrayMember({
      name: 'statGrid',
      title: 'Stat grid',
      type: 'object',
      fields: [
        defineField({
          name: 'stats',
          title: 'Stats',
          type: 'array',
          validation: (rule) => rule.min(1).max(6),
          of: [
            defineArrayMember({
              type: 'object',
              fields: [
                defineField({name: 'value', title: 'Value (e.g. 9.42 Gbps)', type: 'string', validation: (rule) => rule.required()}),
                defineField({name: 'label', title: 'Label (e.g. Throughput)', type: 'string', validation: (rule) => rule.required()}),
              ],
              preview: {select: {title: 'value', subtitle: 'label'}},
            }),
          ],
        }),
      ],
      preview: {
        select: {stats: 'stats'},
        prepare: ({stats}) => ({
          title: `Stat grid (${Array.isArray(stats) ? stats.length : 0})`,
          subtitle: Array.isArray(stats) ? stats.map((stat: {value?: string}) => stat.value).filter(Boolean).join(' · ') : '',
        }),
      },
    }),
    defineArrayMember({
      name: 'keyTakeaways',
      title: 'Key takeaways',
      type: 'object',
      fields: [
        defineField({
          name: 'points',
          title: 'Points',
          type: 'array',
          of: [defineArrayMember({type: 'string'})],
          validation: (rule) => rule.min(1).error('Add at least one takeaway.'),
        }),
      ],
      preview: {
        select: {points: 'points'},
        prepare: ({points}) => ({
          title: `Key takeaways (${Array.isArray(points) ? points.length : 0})`,
          subtitle: Array.isArray(points) ? points[0] : '',
        }),
      },
    }),
  ],
})
