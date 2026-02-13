import type { Block } from 'payload'
import { defaultLexical } from '@/collections/fields/defaultLexical'

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
      name: 'explanationLabel',
      type: 'text',
      label: 'Explanation Label',
      defaultValue: 'Why this matters',
      admin: {
        description: 'Small heading shown below the subheadline.',
      },
    },
    {
      name: 'explanationText',
      type: 'textarea',
      label: 'Explanation Text',
      defaultValue: 'This petition helps us demonstrate broad public support and strengthens our case at the Capitol.',
      admin: {
        description: 'Additional plain-language explanation shown below the subheadline.',
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
