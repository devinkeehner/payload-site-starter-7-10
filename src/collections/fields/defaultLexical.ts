import type { TextFieldSingleValidation } from 'payload'
import {
  LinkFeature,
  lexicalEditor,
  
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
    ...defaultFeatures,
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
