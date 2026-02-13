import type { Block } from 'payload'
import { defaultLexical } from '@/collections/fields/defaultLexical'

const textToLexical = (raw: string) => {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const children =
    lines.length > 0
      ? lines.map((line) => ({
          type: 'paragraph',
          version: 1,
          children: [
            {
              type: 'text',
              version: 1,
              text: line,
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
            },
          ],
          direction: null,
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
        }))
      : [
          {
            type: 'paragraph',
            version: 1,
            children: [],
            direction: null,
            format: '',
            indent: 0,
            textFormat: 0,
            textStyle: '',
          },
        ]

  return {
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children,
    },
  }
}

const normalizeLexicalValue = (value: unknown) => {
  if (!value) return value
  if (typeof value === 'object') return value
  if (typeof value === 'string') return textToLexical(value)
  return value
}

export const PetitionDriveBlockConfig: Block = {
  slug: 'petitionDrive',
  interfaceName: 'PetitionDriveBlock',
  labels: {
    singular: 'Petition Drive',
    plural: 'Petition Drives',
  },
  fields: [
    {
      name: 'eyebrow',
      type: 'text',
      defaultValue: 'Petition Drive',
    },
    {
      name: 'headline',
      type: 'text',
      required: true,
      defaultValue: 'Sign the Petition',
    },
    {
      name: 'subheadline',
      type: 'textarea',
      defaultValue: 'Join supporters across Connecticut and add your name in under 20 seconds.',
    },
    {
      name: 'explanationText',
      type: 'richText',
      label: 'Explanation Content',
      editor: defaultLexical,
      hooks: {
        afterRead: [
          ({ value }) => {
            return normalizeLexicalValue(value)
          },
        ],
        beforeValidate: [
          ({ value }) => {
            return normalizeLexicalValue(value)
          },
        ],
      },
    },
    {
      name: 'desktopLogo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'mobileLogo',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'backgroundImage',
      type: 'upload',
      relationTo: 'media',
      required: true,
    },
    {
      name: 'overlayStrength',
      type: 'select',
      defaultValue: 'medium',
      options: [
        { label: 'Light', value: 'light' },
        { label: 'Medium', value: 'medium' },
        { label: 'Heavy', value: 'heavy' },
      ],
    },
    {
      name: 'form',
      type: 'relationship',
      relationTo: 'forms',
      required: true,
      filterOptions: ({ req }) => {
        const t = (req as { tenant?: unknown })?.tenant
        const tenantID = typeof t === 'string' ? t : (t as { id?: string | null } | null)?.id
        return tenantID ? { tenant: { equals: tenantID } } : true
      },
    },
    {
      name: 'formTitleOverride',
      type: 'text',
      defaultValue: 'Add Your Name',
    },
    {
      name: 'petitionFormKicker',
      type: 'text',
      label: 'Form Kicker (Optional)',
      admin: {
        description: 'Short uppercase line above the form title. Leave blank to hide.',
      },
    },
    {
      name: 'petitionFormSupportText',
      type: 'textarea',
      defaultValue: 'Join supporters across Connecticut. It takes less than 20 seconds.',
    },
    {
      name: 'petitionSubmitLabel',
      type: 'text',
      defaultValue: 'Add My Name Now',
      label: 'Submit Button Text',
      admin: {
        description: 'Text shown on the main petition submit button.',
      },
    },
    {
      name: 'petitionPrivacyText',
      type: 'text',
      defaultValue: 'We respect your privacy and never sell your data',
      label: 'Privacy Line Text',
      admin: {
        description: 'Small line of text shown below the submit button.',
      },
    },
    {
      name: 'disclaimer',
      type: 'textarea',
      defaultValue: 'By signing, you agree to receive updates related to this petition.',
    },
    {
      name: 'sideContentType',
      type: 'select',
      defaultValue: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'Video URL', value: 'video' },
        { label: 'Image', value: 'image' },
        { label: 'Text', value: 'text' },
      ],
    },
    {
      name: 'sideVideoURL',
      type: 'text',
      admin: {
        condition: (_data, siblingData) => siblingData?.sideContentType === 'video',
      },
    },
    {
      name: 'enableSideFollowupContent',
      type: 'checkbox',
      label: 'Add Text Under Side Video',
      defaultValue: false,
      admin: {
        condition: (_data, siblingData) => siblingData?.sideContentType === 'video',
      },
    },
    {
      name: 'sideFollowupContent',
      type: 'richText',
      label: 'Side Video Follow-up Content',
      editor: defaultLexical,
      admin: {
        condition: (_data, siblingData) =>
          siblingData?.sideContentType === 'video' && Boolean(siblingData?.enableSideFollowupContent),
      },
    },
    {
      name: 'sideImage',
      type: 'upload',
      relationTo: 'media',
      admin: {
        condition: (_data, siblingData) => siblingData?.sideContentType === 'image',
      },
    },
    {
      name: 'sideText',
      type: 'textarea',
      admin: {
        condition: (_data, siblingData) => siblingData?.sideContentType === 'text',
      },
    },
  ],
}
