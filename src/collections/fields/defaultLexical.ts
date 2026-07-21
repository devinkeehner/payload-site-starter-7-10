import type { TextFieldSingleValidation } from 'payload'
import {
  LinkFeature,
  lexicalEditor,
  UploadFeature,
  type LinkFields,
} from '@payloadcms/richtext-lexical'

const validateExternalLinkURL: TextFieldSingleValidation = (value, options) => {
  const siblingData = options?.siblingData as LinkFields | undefined

  if (siblingData?.linkType === 'internal') {
    return true
  }

  return value ? true : 'URL is required'
}

export const defaultLexical = lexicalEditor({
  features: ({ defaultFeatures }) => [
    ...defaultFeatures.filter((feature) => feature.key !== 'upload'),
    UploadFeature({
      collections: {
        media: {
          fields: [
            {
              name: 'linkURL',
              type: 'text',
              label: 'Make image clickable (optional)',
              admin: {
                description:
                  'Enter a full URL (https://...) or a site path (for example, /donate).',
              },
            },
            {
              name: 'alignment',
              type: 'select',
              defaultValue: 'left',
              label: 'Position image',
              options: [
                { label: 'Left', value: 'left' },
                { label: 'Right', value: 'right' },
              ],
              admin: {
                description:
                  'The image keeps its natural width instead of expanding to the full content width.',
              },
            },
          ],
        },
      },
    }),
    LinkFeature({
      enabledCollections: ['pages', 'posts'],
      fields: ({ defaultFields }) => {
        const defaultFieldsWithoutUrl = defaultFields.filter((field) => {
          if ('name' in field && field.name === 'url') return false
          return true
        })

        return [
          ...defaultFieldsWithoutUrl,
          {
            name: 'url',
            type: 'text',
            admin: {
              condition: (_data, siblingData) => siblingData?.linkType !== 'internal',
            },
            label: ({ t }) => t('fields:enterURL'),
            required: true,
            validate: validateExternalLinkURL,
          },
        ]
      },
    }),
  ],
})
