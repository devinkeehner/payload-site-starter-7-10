import type { Block } from 'payload'

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
      defaultValue: 'Petition Signature',
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
    },
    {
      name: 'petitionPrivacyText',
      type: 'text',
      defaultValue: 'We respect your privacy and never sell your data',
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
