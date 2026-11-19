import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {visionTool} from '@sanity/vision'
import {schemaTypes} from './schema-types'

export default defineConfig({
  name: 'default',
  title: 'TechSavvy Content',
  projectId: 'dnlgguay',
  dataset: 'production',
  plugins: [
    structureTool({
      structure: (S) =>
        S.list()
          .title('TechSavvy Content')
          .items([
            S.documentTypeListItem('post').title('Blog Posts'),
            S.listItem()
              .title('Comments')
              .child(
                S.list()
                  .title('Comments')
                  .items([
                    S.listItem()
                      .title('Awaiting approval')
                      .child(S.documentTypeList('comment').title('Awaiting approval').filter('_type == "comment" && approved != true')),
                    S.listItem()
                      .title('Approved')
                      .child(S.documentTypeList('comment').title('Approved').filter('_type == "comment" && approved == true')),
                    S.divider(),
                    S.documentTypeListItem('comment').title('All comments'),
                  ]),
              ),
            S.divider(),
            S.documentTypeListItem('author').title('Authors'),
            S.documentTypeListItem('category').title('Categories'),
          ]),
    }),
    visionTool(),
  ],
  schema: {types: schemaTypes},
})
